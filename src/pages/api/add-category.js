import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SUBCATEGORY_MACROS, SYS_CAT } from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";

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
	// Validación de forma del payload (400 con { error } en español).
	let name;
	let macroType;
	try {
		const body = await parseJsonBody(context.request);
		name = v.nonEmptyString(body.name, "name");
		macroType = v.enum(body.macro_type, "macro_type", SUBCATEGORY_MACROS);
	} catch (e) {
		if (e instanceof ValidationError) return jsonError(e.message);
		throw e;
	}

	// Regla semántica (no de forma): un nombre del sistema no se puede reutilizar.
	if (RESERVED.has(name)) {
		return json({ error: `"${name}" es una categoría reservada.` }, 422);
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
