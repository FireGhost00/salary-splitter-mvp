import { createSupabaseServerClient } from "../../lib/supabase.js";
import { BASE_SUBCATEGORIES, CORE_CATEGORIES } from "../../lib/budget.js";

// Ruta on-demand: siembra la cuenta del usuario nuevo. Protegida por SSR.
export const prerender = false;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * POST /api/seed-account
 * Crea (si faltan) el perfil y el diccionario base de categorías para el
 * usuario de la sesión: las 3 maestras + subcategorías (Alquiler, Supermercado,
 * Restaurantes, …). Idempotente. Responde { ok: true, count }.
 */
export async function POST(context) {
	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	// 1. Perfil mínimo (dashboard.astro lo exige). No pisa uno existente.
	const fallbackName = (user.email?.split("@")[0] || "Usuario").slice(0, 40);
	const { error: profileError } = await supabase
		.from("profiles")
		.upsert(
			{ id: user.id, first_name: fallbackName, base_salary: 0 },
			{ onConflict: "id", ignoreDuplicates: true },
		);
	if (profileError) return json({ error: profileError.message }, 500);

	// 2. Categorías: maestras (macro_type 'estandar') + subcategorías.
	const rows = [
		...CORE_CATEGORIES.map((c) => ({
			user_id: user.id,
			name: c.name,
			macro_type: c.macro_type,
			type: "estandar",
			target_amount: 0,
		})),
		...BASE_SUBCATEGORIES.map((c) => ({
			user_id: user.id,
			name: c.name,
			macro_type: c.macro_type,
			type: "estandar",
			target_amount: 0,
		})),
	];

	const { error: catError } = await supabase
		.from("categories")
		.upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });
	if (catError) return json({ error: catError.message }, 500);

	const { count } = await supabase
		.from("categories")
		.select("name", { count: "exact", head: true })
		.eq("user_id", user.id);

	return json({ ok: true, count: count ?? rows.length }, 200);
}
