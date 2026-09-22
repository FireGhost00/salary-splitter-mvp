import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SYS_CAT, isSubcategory } from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";
import { withLogging } from "../../lib/logger.js";

// Ruta on-demand: elimina una subcategoría personalizada. Protegida por SSR.
export const prerender = false;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const RESERVED = new Set(Object.values(SYS_CAT));

/**
 * DELETE /api/delete-category
 * Body: { name: string }
 *
 * Borra SOLO la fila de `categories`. `transactions.subcategory` es texto
 * libre sin FK: las transacciones que ya usaron esta subcategoría CONSERVAN
 * la etiqueta a propósito -- no se tocan ni se borran.
 */
async function handleDELETE(context) {
	// Validación de forma del payload (400 con { error } en español).
	let name;
	try {
		const body = await parseJsonBody(context.request);
		name = v.nonEmptyString(body.name, "name");
	} catch (e) {
		if (e instanceof ValidationError) return jsonError(e.message);
		throw e;
	}

	// Defensa adicional (la UI nunca debería ofrecer borrar un nombre de
	// sistema): categories.name -> ON DELETE CASCADE hacia transactions.
	if (RESERVED.has(name)) {
		return json({ error: `"${name}" es una categoría reservada.` }, 422);
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

	const { data: deleted, error: delErr } = await supabase
		.from("categories")
		.delete()
		.eq("user_id", user.id)
		.eq("name", name)
		.select("name");
	if (delErr) return json({ error: delErr.message }, 500);
	if (!deleted || deleted.length === 0) {
		return json({ error: `"${name}" no existe como subcategoría tuya.` }, 404);
	}

	return json({ ok: true, deleted: name }, 200);
}

export const DELETE = withLogging("delete-category", handleDELETE);
