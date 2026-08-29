import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: actualiza macro_type + target_amount de las categorías.
export const prerender = false;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const MACRO_TYPES = new Set([
	"",
	"Necesidades",
	"Deseos",
	"Ahorro",
	"provision",
	"deuda",
]);

/**
 * POST /api/update-categories
 * Body: { items: { name: string, macro_type: string, target_amount: number }[] }
 * `target_amount` en CENTAVOS. UPDATE por (user_id, name).
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const items = Array.isArray(body?.items) ? body.items : null;
	if (!items || items.length === 0) {
		return json({ error: "`items` debe ser un arreglo no vacío." }, 400);
	}

	for (const it of items) {
		if (typeof it?.name !== "string" || it.name.trim() === "") {
			return json({ error: "Cada item necesita `name`." }, 422);
		}
		if (!MACRO_TYPES.has(String(it?.macro_type ?? ""))) {
			return json({ error: `macro_type inválido en "${it.name}".` }, 422);
		}
		const t = Number(it?.target_amount);
		if (!Number.isInteger(t) || t < 0) {
			return json(
				{ error: `target_amount inválido en "${it.name}".` },
				422,
			);
		}
		if (
			(it.macro_type === "deuda" || it.macro_type === "provision") &&
			t <= 0
		) {
			return json(
				{ error: `"${it.name}" (${it.macro_type}) necesita un monto mayor que 0.` },
				422,
			);
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

	const results = await Promise.all(
		items.map((it) =>
			supabase
				.from("categories")
				.update({
					macro_type: it.macro_type === "" ? null : it.macro_type,
					target_amount: Math.round(Number(it.target_amount)),
				})
				.eq("user_id", user.id)
				.eq("name", it.name.trim())
				.select("name"),
		),
	);

	const failed = results.find((r) => r.error);
	if (failed) {
		return json({ error: failed.error.message }, 500);
	}

	return json({ ok: true }, 200);
}
