import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: actualiza el target_amount (meta) de las categorías.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * POST /api/update-targets
 * Body: { items: { id: string, target_amount: number }[] }  (o el arreglo directo)
 * `id` = nombre de la categoría; `target_amount` en CENTAVOS (frontend × 100).
 * UPDATE de `target_amount` por (user_id, name).
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const items = Array.isArray(body) ? body : body?.items;
	if (!Array.isArray(items) || items.length === 0) {
		return json({ error: "`items` debe ser un arreglo no vacío." }, 400);
	}

	const clean = [];
	for (const it of items) {
		const id = typeof it?.id === "string" ? it.id.trim() : "";
		const amount = Number(it?.target_amount);
		if (!id) {
			return json({ error: "Cada item necesita `id`." }, 422);
		}
		if (!Number.isInteger(amount) || amount < 0) {
			return json({ error: `target_amount inválido en "${id}".` }, 422);
		}
		clean.push({ id, target_amount: amount });
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

	const results = await Promise.all(
		clean.map((it) =>
			supabase
				.from("categories")
				.update({ target_amount: it.target_amount })
				.eq("user_id", user.id)
				.eq("name", it.id)
				.select("name"),
		),
	);

	const failed = results.find((r) => r.error);
	if (failed) {
		return json({ error: failed.error.message }, 500);
	}

	return json({ ok: true, updated: clean.length }, 200);
}
