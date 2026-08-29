import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: borra una transacción del usuario de la sesión.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * DELETE /api/delete-transaction
 * id vía body JSON `{ id }` o query `?id=`.
 *
 * Valida la sesión (SSR/cookies) y hace DELETE filtrando por `id` Y `user_id`,
 * de modo que un id ajeno no borra nada (respuesta 404).
 */
export async function DELETE(context) {
	const url = new URL(context.request.url);
	let rawId = url.searchParams.get("id");

	if (rawId == null) {
		try {
			const body = await context.request.json();
			rawId = body?.id;
		} catch {
			// sin body -> se queda como null
		}
	}

	const idIsValid =
		(typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) ||
		(typeof rawId === "string" && /^\d+$/.test(rawId.trim()));

	if (!idIsValid) {
		return json({ error: "`id` debe ser un identificador válido." }, 400);
	}

	const id = typeof rawId === "string" ? Number.parseInt(rawId.trim(), 10) : rawId;

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

	const { data, error } = await supabase
		.from("transactions")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id)
		.select("id");

	if (error) {
		return json({ error: error.message }, 500);
	}
	if (!data || data.length === 0) {
		return json({ error: "No se encontró el movimiento (o no es tuyo)." }, 404);
	}

	return json({ ok: true, deleted: data[0].id }, 200);
}
