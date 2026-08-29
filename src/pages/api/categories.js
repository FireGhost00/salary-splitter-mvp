import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: alta y baja de categorías del usuario (SSR + cookies).
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const MACRO_TYPES = new Set(["deuda", "provision", "estandar"]);

/**
 * POST /api/categories
 * Body: { name: string, macro_type: "deuda"|"provision"|"estandar", target_amount: number }
 * `target_amount` en CENTAVOS. Se asocia al user_id de la sesión.
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
	const targetAmount = Number(body?.target_amount ?? 0);

	if (!name) {
		return json({ error: "El nombre es obligatorio." }, 422);
	}
	if (!MACRO_TYPES.has(macroType)) {
		return json(
			{ error: "macro_type debe ser 'deuda', 'provision' o 'estandar'." },
			422,
		);
	}
	if (!Number.isInteger(targetAmount) || targetAmount < 0) {
		return json({ error: "`target_amount` inválido." }, 422);
	}
	if (
		(macroType === "deuda" || macroType === "provision") &&
		targetAmount <= 0
	) {
		return json(
			{ error: `Una categoría de ${macroType} necesita un monto mayor que 0.` },
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

	const { data, error } = await supabase
		.from("categories")
		.insert({
			user_id: user.id,
			name,
			macro_type: macroType,
			target_amount: targetAmount,
			// `type` es NOT NULL en esquemas previos a la migración 0005; se rellena
			// con macro_type para que el INSERT no falle antes de migrar.
			type: macroType,
		})
		.select("name, macro_type, target_amount")
		.single();

	if (error) {
		if (error.code === "23505") {
			return json({ error: `Ya tienes una categoría llamada "${name}".` }, 409);
		}
		return json({ error: error.message }, 500);
	}

	return json({ ok: true, category: data }, 201);
}

/**
 * DELETE /api/categories
 * `name` vía body JSON `{ name }` o query `?name=`.
 */
export async function DELETE(context) {
	const url = new URL(context.request.url);
	let name = url.searchParams.get("name");
	if (name == null) {
		try {
			const body = await context.request.json();
			name = body?.name;
		} catch {
			// sin body
		}
	}
	name = typeof name === "string" ? name.trim() : "";
	if (!name) {
		return json({ error: "Falta `name`." }, 400);
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

	const { data, error } = await supabase
		.from("categories")
		.delete()
		.eq("user_id", user.id)
		.eq("name", name)
		.select("name");

	if (error) {
		if (error.code === "23503") {
			return json(
				{
					error:
						"No se puede borrar: tiene movimientos o reglas asociadas.",
				},
				409,
			);
		}
		return json({ error: error.message }, 500);
	}
	if (!data || data.length === 0) {
		return json({ error: "Categoría no encontrada." }, 404);
	}

	return json({ ok: true, deleted: data[0].name }, 200);
}
