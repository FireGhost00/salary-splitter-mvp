import { createSupabaseServerClient } from "../../../lib/supabase.js";

// Ruta on-demand: borra en Supabase. El resto del sitio sigue estático (CONVENCIONES.md §1).
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * POST /api/transaction/delete
 * Body: { id: number | string }  (id de la fila en `transactions`)
 *
 * Valida la sesión vía SSR (cookies de Supabase Auth). El DELETE se apoya en
 * RLS: aunque el `id` fuera de otro usuario, la política `user_id = auth.uid()`
 * impide borrarlo y la respuesta es 404.
 */
export async function POST(context) {
	const { request } = context;

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const { id } = body ?? {};
	const idIsValid =
		(typeof id === "number" && Number.isInteger(id) && id > 0) ||
		(typeof id === "string" && /^\d+$/.test(id.trim()));

	if (!idIsValid) {
		return json({ error: "`id` debe ser un identificador válido." }, 400);
	}

	const rowId = typeof id === "string" ? id.trim() : id;

	let supabase;
	try {
		supabase = createSupabaseServerClient(context);
	} catch (configError) {
		return json({ error: configError.message }, 500);
	}

	// Validación de usuario vía SSR: sin sesión no se borra nada.
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return json({ error: "No autenticado." }, 401);
	}

	const { data, error } = await supabase
		.from("transactions")
		.delete()
		.eq("id", rowId)
		.select("id");

	if (error) {
		return json({ error: error.message }, 500);
	}
	if (!data || data.length === 0) {
		return json({ error: "No se encontró el movimiento (o no es tuyo)." }, 404);
	}

	return json({ deleted: data[0].id }, 200);
}
