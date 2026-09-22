import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SYS_CAT, isSubcategory } from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";
import { withLogging } from "../../lib/logger.js";

// Ruta on-demand: renombra una subcategoría personalizada. Protegida por SSR.
export const prerender = false;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const RESERVED = new Set(Object.values(SYS_CAT));

/**
 * POST /api/rename-category
 * Body: { name: string, new_name: string }
 *
 * Actualiza `categories.name` (PK compuesta (user_id, name)) Y reescribe
 * todas las `transactions.subcategory` que coincidieran con el nombre viejo
 * (mismo user_id) -- ese campo es texto libre sin FK, así que el Historial
 * no lo actualiza solo.
 */
async function handlePOST(context) {
	// Validación de forma del payload (400 con { error } en español).
	let name;
	let newName;
	try {
		const body = await parseJsonBody(context.request);
		name = v.nonEmptyString(body.name, "name");
		newName = v.nonEmptyString(body.new_name, "new_name", { maxLen: 120 });
	} catch (e) {
		if (e instanceof ValidationError) return jsonError(e.message);
		throw e;
	}

	// Regla semántica: ni el origen ni el destino pueden ser un nombre de
	// sistema (categories.name -> ON DELETE/UPDATE CASCADE hacia transactions).
	if (RESERVED.has(name)) {
		return json({ error: `"${name}" es una categoría reservada.` }, 422);
	}
	if (RESERVED.has(newName)) {
		return json({ error: `"${newName}" es una categoría reservada.` }, 422);
	}
	if (name === newName) {
		return json({ error: "El nuevo nombre es igual al actual." }, 422);
	}

	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	// Ownership + confirma que es de verdad una subcategoría (no un master).
	const { data: row, error: rowErr } = await supabase
		.from("categories")
		.select("name, macro_type")
		.eq("user_id", user.id)
		.eq("name", name)
		.maybeSingle();
	if (rowErr) return json({ error: rowErr.message }, 500);
	if (!row || !isSubcategory(row)) {
		return json({ error: `"${name}" no existe como subcategoría tuya.` }, 404);
	}

	// Colisión proactiva: mensaje claro antes de tocar la base.
	const { data: clash, error: clashErr } = await supabase
		.from("categories")
		.select("name")
		.eq("user_id", user.id)
		.eq("name", newName)
		.maybeSingle();
	if (clashErr) return json({ error: clashErr.message }, 500);
	if (clash) {
		return json({ error: `Ya tienes una categoría llamada "${newName}".` }, 409);
	}

	// 1) Renombra la fila. Si dos requests colisionan a la vez, la unique
	//    violation de la PK compuesta (23505) se traduce al mismo mensaje
	//    claro en vez de un 500 genérico.
	const { data: updatedCat, error: catErr } = await supabase
		.from("categories")
		.update({ name: newName })
		.eq("user_id", user.id)
		.eq("name", name)
		.select("name, macro_type")
		.maybeSingle();
	if (catErr) {
		if (catErr.code === "23505") {
			return json(
				{ error: `Ya tienes una categoría llamada "${newName}".` },
				409,
			);
		}
		return json({ error: catErr.message }, 500);
	}
	if (!updatedCat) {
		return json({ error: `"${name}" no existe como subcategoría tuya.` }, 404);
	}

	// 2) Reescribe el historial: transactions.subcategory es texto libre sin
	//    FK, no lo actualiza ningún CASCADE.
	const { error: txErr } = await supabase
		.from("transactions")
		.update({ subcategory: newName })
		.eq("user_id", user.id)
		.eq("subcategory", name);
	if (txErr) return json({ error: txErr.message }, 500);

	return json({ ok: true, category: updatedCat }, 200);
}

export const POST = withLogging("rename-category", handlePOST);
