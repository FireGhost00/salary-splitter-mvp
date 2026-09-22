import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SYS_CAT, isSubcategory, parentMasterOf } from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";
import { withLogging } from "../../lib/logger.js";

// Ruta on-demand: reasigna la subcategoría de un gasto ya registrado.
// Protegida por SSR. NO es un editor general de transacciones: solo toca
// `subcategory`, nunca el monto, la fecha, category_id ni provision_item_id.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Los únicos sobres con subcategorías reales (ver src/lib/budget.js). */
const MASTER_ENVELOPES = new Set([
	SYS_CAT.necesidad,
	SYS_CAT.deseo,
	SYS_CAT.ahorro,
]);

/**
 * PATCH /api/update-transaction-subcategory
 * Body: { id: number, subcategory: string | null }  -- null/"" quita la subcategoría.
 *
 * Reglas:
 *  - La transacción debe ser del usuario (misma sesión).
 *  - transaction_type debe ser 'gasto' y category_id uno de los 3 sobres
 *    maestros (Necesidad/Deseo/Ahorro): Deuda y Provisiones no tienen
 *    subcategorías en este modelo.
 *  - Si `subcategory` no es null, debe existir como subcategoría del usuario
 *    y su parentMaster debe coincidir con el category_id de la transacción
 *    (no se puede etiquetar un gasto de Necesidad con una subcategoría de
 *    Deseo).
 */
async function handlePATCH(context) {
	// Validación de forma del payload (400 con { error } en español).
	let id;
	let subcategory;
	try {
		const body = await parseJsonBody(context.request);
		id = v.positiveInt(body.id, "id");
		// null/""/ausente -> null (quitar la subcategoría), ver v.optionalString.
		subcategory = v.optionalString(body.subcategory, "subcategory", {
			maxLen: 120,
		});
	} catch (e) {
		if (e instanceof ValidationError) return jsonError(e.message);
		throw e;
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
					"Solo se puede asignar subcategoría a un gasto contra Necesidad, Deseo o Ahorro.",
			},
			422,
		);
	}

	if (subcategory != null) {
		const { data: subRow, error: subErr } = await supabase
			.from("categories")
			.select("name, macro_type")
			.eq("user_id", user.id)
			.eq("name", subcategory)
			.maybeSingle();
		if (subErr) return json({ error: subErr.message }, 500);
		if (!subRow || !isSubcategory(subRow)) {
			return json(
				{ error: `\`${subcategory}\` no existe como subcategoría tuya.` },
				422,
			);
		}
		const parentMaster = parentMasterOf(subRow.macro_type);
		if (parentMaster !== txRow.category_id) {
			return json(
				{
					error: `\`${subcategory}\` pertenece a ${parentMaster}, no a ${txRow.category_id}.`,
				},
				422,
			);
		}
	}

	const { data: updated, error: updErr } = await supabase
		.from("transactions")
		.update({ subcategory })
		.eq("id", id)
		.eq("user_id", user.id)
		.select("id, subcategory")
		.single();
	if (updErr) return json({ error: updErr.message }, 500);

	return json({ ok: true, transaction: updated }, 200);
}

export const PATCH = withLogging("update-transaction-subcategory", handlePATCH);
