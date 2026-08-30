import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SUBCATEGORY_MACROS, SYS_CAT } from "../../lib/budget.js";

// Ruta on-demand: crea una subcategoría personalizada. Protegida por SSR.
export const prerender = false;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const RESERVED = new Set(Object.values(SYS_CAT));

/**
 * POST /api/add-category
 * Body: { name: string, macro_type: "necesidad" | "deseo" | "ahorro" }
 * Inserta una fila en `categories` (idempotente por (user_id, name)).
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const name = typeof body?.name === "string" ? body.name.trim() : "";
	const macroType = String(body?.macro_type ?? "");

	if (!name) return json({ error: "El nombre es obligatorio." }, 400);
	if (RESERVED.has(name)) {
		return json({ error: `"${name}" es una categoría reservada.` }, 422);
	}
	if (!SUBCATEGORY_MACROS.includes(macroType)) {
		return json(
			{ error: "macro_type debe ser 'necesidad', 'deseo' o 'ahorro'." },
			422,
		);
	}

	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	const { data, error } = await supabase
		.from("categories")
		.upsert(
			{
				user_id: user.id,
				name,
				macro_type: macroType,
				type: "estandar",
				target_amount: 0,
			},
			{ onConflict: "user_id,name", ignoreDuplicates: true },
		)
		.select("name, macro_type")
		.maybeSingle();

	if (error) return json({ error: error.message }, 500);

	return json({ ok: true, category: data ?? { name, macro_type: macroType } }, 200);
}
