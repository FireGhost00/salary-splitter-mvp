import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: reemplaza las reglas de distribución del usuario.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * POST /api/update-rules
 * Body: { rules: { category_id: string, percentage: number }[] }  (o el arreglo directo)
 * Borra TODAS las distribution_rules del usuario y reinserta las recibidas.
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const incoming = Array.isArray(body) ? body : body?.rules;
	if (!Array.isArray(incoming) || incoming.length === 0) {
		return json({ error: "`rules` debe ser un arreglo no vacío." }, 400);
	}

	// Normaliza + valida ANTES de tocar la base de datos.
	const rules = [];
	const seen = new Set();
	for (const raw of incoming) {
		const categoryId =
			typeof raw?.category_id === "string" ? raw.category_id.trim() : "";
		const percentage = Number(raw?.percentage);

		if (!categoryId) {
			return json({ error: "Cada regla necesita `category_id`." }, 422);
		}
		if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
			return json({ error: `Porcentaje inválido para "${categoryId}".` }, 422);
		}
		if (seen.has(categoryId)) {
			return json({ error: `Categoría duplicada: "${categoryId}".` }, 422);
		}
		seen.add(categoryId);
		if (percentage > 0) rules.push({ category_id: categoryId, percentage });
	}

	const total = rules.reduce((sum, r) => sum + r.percentage, 0);
	if (total !== 100) {
		return json(
			{ error: `Los porcentajes deben sumar 100 (suman ${total}).` },
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

	// Borra las reglas actuales.
	const { error: deleteError } = await supabase
		.from("distribution_rules")
		.delete()
		.eq("user_id", user.id);

	if (deleteError) {
		return json({ error: deleteError.message }, 500);
	}

	// Inserta las nuevas en bloque.
	const { data, error: insertError } = await supabase
		.from("distribution_rules")
		.insert(rules.map((r) => ({ user_id: user.id, ...r })))
		.select("category_id, percentage");

	if (insertError) {
		return json(
			{
				error: `Se borraron las reglas anteriores pero falló el alta: ${insertError.message}`,
				rules,
			},
			500,
		);
	}

	return json({ ok: true, rules: data }, 200);
}
