import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SYS_CAT, isSubcategory, parentMasterOf } from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";
import { withLogging } from "../../lib/logger.js";

// Ruta on-demand: reclasifica un gasto ya registrado (sobre y/o subcategoría).
// Protegida por SSR. NO es un editor general de transacciones: solo toca
// `category_id` y `subcategory`, nunca el monto, la fecha ni el tipo.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Los únicos sobres entre los que se puede reclasificar un gasto. */
const MASTER_ENVELOPES = new Set([
	SYS_CAT.necesidad,
	SYS_CAT.deseo,
	SYS_CAT.ahorro,
]);

/**
 * PATCH /api/reclassify-transaction
 * Body: { id: number, category_id?: string, subcategory?: string | null }
 * Al menos uno de `category_id` / `subcategory` debe venir en el body.
 *
 * Mover un gasto de un sobre maestro a otro DESPLAZA saldo disponible
 * retroactivamente entre ambos -- es el efecto buscado, no un caso a evitar.
 *
 * Reglas:
 *  - La transacción debe ser del usuario (misma sesión) y de tipo 'gasto'.
 *  - El category_id ACTUAL de la transacción debe ser uno de los 3 sobres
 *    maestros (Necesidad/Deseo/Ahorro): no se reclasifican gastos de
 *    Deuda/Provisiones con este endpoint, como origen.
 *  - Si viene `category_id` nuevo, también debe ser uno de los 3 maestros:
 *    tampoco pueden ser destino.
 *  - Si `subcategory` viene y no es null, debe existir como subcategoría del
 *    usuario y su parentMaster debe coincidir con el category_id EFECTIVO
 *    (el nuevo si se mandó `category_id`, si no el actual de la fila).
 *  - Si `category_id` cambia y el body NO trae la clave `subcategory`, la
 *    subcategoría existente se limpia (null): pertenecía al sobre viejo.
 */
async function handlePATCH(context) {
	// Validación de forma del payload (400 con { error } en español).
	let id;
	let hasCategoryId;
	let newCategoryId = null;
	let hasSubcategoryKey;
	let newSubcategory = null;
	try {
		const body = await parseJsonBody(context.request);
		id = v.positiveInt(body.id, "id");

		hasCategoryId = body.category_id !== undefined && body.category_id !== null;
		if (hasCategoryId) {
			newCategoryId = v.nonEmptyString(body.category_id, "category_id");
		}

		hasSubcategoryKey = Object.prototype.hasOwnProperty.call(body, "subcategory");
		if (hasSubcategoryKey) {
			newSubcategory = v.optionalString(body.subcategory, "subcategory", {
				maxLen: 120,
			});
		}

		if (!hasCategoryId && !hasSubcategoryKey) {
			throw new ValidationError("Debes enviar `category_id` o `subcategory`.");
		}
	} catch (e) {
		if (e instanceof ValidationError) return jsonError(e.message);
		throw e;
	}

	if (hasCategoryId && !MASTER_ENVELOPES.has(newCategoryId)) {
		return json(
			{
				error:
					"El sobre destino debe ser Necesidad, Deseo o Ahorro (Deuda y Provisiones no se reclasifican aquí).",
			},
			422,
		);
	}

	let supabase;
	try {
		supabase = createSupabaseServerClient(context);
	} catch (configError) {
		return json({ error: configError.message }, 500);
	}

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return json({ error: "No autenticado." }, 401);
	}

	// Ownership: mismo patrón que delete-transaction.js.
	const { data: txRow, error: txErr } = await supabase
		.from("transactions")
		.select("id, transaction_type, category_id")
		.eq("id", id)
		.eq("user_id", user.id)
		.maybeSingle();
	if (txErr) return json({ error: txErr.message }, 500);
	if (!txRow) {
		return json({ error: "No se encontró el movimiento (o no es tuyo)." }, 404);
	}

	if (
		txRow.transaction_type !== "gasto" ||
		!MASTER_ENVELOPES.has(txRow.category_id)
	) {
		return json(
			{
				error:
					"Solo se pueden reclasificar gastos contra Necesidad, Deseo o Ahorro.",
			},
			422,
		);
	}

	const effectiveCategoryId = hasCategoryId ? newCategoryId : txRow.category_id;

	// Subcategoría final a escribir.
	let finalSubcategory;
	if (hasSubcategoryKey) {
		if (newSubcategory != null) {
			const { data: subRow, error: subErr } = await supabase
				.from("categories")
				.select("name, macro_type")
				.eq("user_id", user.id)
				.eq("name", newSubcategory)
				.maybeSingle();
			if (subErr) return json({ error: subErr.message }, 500);
			if (!subRow || !isSubcategory(subRow)) {
				return json(
					{ error: `\`${newSubcategory}\` no existe como subcategoría tuya.` },
					422,
				);
			}
			const parentMaster = parentMasterOf(subRow.macro_type);
			if (parentMaster !== effectiveCategoryId) {
				return json(
					{
						error: `\`${newSubcategory}\` pertenece a ${parentMaster}, no a ${effectiveCategoryId}.`,
					},
					422,
				);
			}
		}
		finalSubcategory = newSubcategory; // null (quitar) o ya validada.
	} else {
		// hasCategoryId es true aquí (si no, ya habríamos rechazado el payload):
		// cambia el sobre y no llegó una subcategoría nueva -> se limpia, no se
		// arrastra una subcategoría que pertenecía al sobre viejo.
		finalSubcategory = null;
	}

	const updatePayload = { subcategory: finalSubcategory };
	if (hasCategoryId) updatePayload.category_id = newCategoryId;

	const { data: updated, error: updErr } = await supabase
		.from("transactions")
		.update(updatePayload)
		.eq("id", id)
		.eq("user_id", user.id)
		.select("id, category_id, subcategory")
		.single();
	if (updErr) return json({ error: updErr.message }, 500);

	return json({ ok: true, transaction: updated }, 200);
}

export const PATCH = withLogging("reclassify-transaction", handlePATCH);
