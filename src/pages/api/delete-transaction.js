import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: borra una transacción (o un bloque) del usuario de la sesión.
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
 * Body JSON o query (prioridad: group_id > created_at > id):
 *   - `group_id`   -> borra TODO el bloque (WHERE group_id = X).
 *   - `created_at` -> borra el bloque de ingreso viejo (sin group_id) que
 *                     comparte ese timestamp exacto (WHERE created_at = X AND
 *                     transaction_type = 'ingreso').
 *   - `id`         -> borra una sola transacción.
 * El filtro por `user_id` impide borrar lo ajeno.
 */
export async function DELETE(context) {
	const url = new URL(context.request.url);
	let rawId = url.searchParams.get("id");
	let rawGroupId = url.searchParams.get("group_id");
	let rawCreatedAt = url.searchParams.get("created_at");

	if (rawId == null && rawGroupId == null && rawCreatedAt == null) {
		try {
			const body = await context.request.json();
			rawId = body?.id ?? null;
			rawGroupId = body?.group_id ?? null;
			rawCreatedAt = body?.created_at ?? null;
		} catch {
			// sin body -> se quedan como null
		}
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

	// --- Borrado por bloque (group_id) --------------------------------
	if (typeof rawGroupId === "string" && rawGroupId.trim() !== "") {
		const groupId = rawGroupId.trim();
		if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(groupId)) {
			return json({ error: "`group_id` inválido." }, 400);
		}

		const { data, error } = await supabase
			.from("transactions")
			.delete()
			.eq("group_id", groupId)
			.eq("user_id", user.id)
			.select("id");

		if (error) return json({ error: error.message }, 500);
		if (!data || data.length === 0) {
			return json({ error: "No se encontró el bloque (o no es tuyo)." }, 404);
		}
		return json({ ok: true, deleted_count: data.length }, 200);
	}

	// --- Borrado por bloque viejo (created_at + tipo ingreso) --------
	if (typeof rawCreatedAt === "string" && rawCreatedAt.trim() !== "") {
		const createdAt = rawCreatedAt.trim();
		if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(createdAt)) {
			return json({ error: "`created_at` inválido." }, 400);
		}

		const { data, error } = await supabase
			.from("transactions")
			.delete()
			.eq("created_at", createdAt)
			.eq("user_id", user.id)
			.eq("transaction_type", "ingreso")
			.select("id");

		if (error) return json({ error: error.message }, 500);
		if (!data || data.length === 0) {
			return json({ error: "No se encontró el bloque (o no es tuyo)." }, 404);
		}
		return json({ ok: true, deleted_count: data.length }, 200);
	}

	// --- Borrado individual (id) --------------------------------------
	const idIsValid =
		(typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) ||
		(typeof rawId === "string" && /^\d+$/.test(rawId.trim()));

	if (!idIsValid) {
		return json(
			{ error: "Falta un `id`, `group_id` o `created_at` válido." },
			400,
		);
	}

	const id = typeof rawId === "string" ? Number.parseInt(rawId.trim(), 10) : rawId;

	const { data, error } = await supabase
		.from("transactions")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id)
		.select("id");

	if (error) return json({ error: error.message }, 500);
	if (!data || data.length === 0) {
		return json({ error: "No se encontró el movimiento (o no es tuyo)." }, 404);
	}
	return json({ ok: true, deleted: data[0].id }, 200);
}
