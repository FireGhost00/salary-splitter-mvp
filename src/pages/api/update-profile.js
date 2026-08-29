import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: actualiza el perfil del usuario de la sesión.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * POST /api/update-profile
 * Body (todos opcionales, al menos uno):
 *   - first_name: string
 *   - base_salary: number (CENTAVOS; se persiste en dólares)
 *   - ideal_monthly_income_cents: number (entero >= 0; meta del "Mes Ideal")
 * UPDATE parcial en `profiles` ligado al user_id de la sesión.
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const patch = {};

	if (body?.first_name !== undefined) {
		const firstName =
			typeof body.first_name === "string" ? body.first_name.trim() : "";
		if (!firstName) return json({ error: "`first_name` no puede ir vacío." }, 400);
		patch.first_name = firstName;
	}

	if (body?.base_salary !== undefined) {
		const baseSalaryCents = Number(body.base_salary);
		if (!Number.isFinite(baseSalaryCents) || baseSalaryCents <= 0) {
			return json({ error: "`base_salary` debe ser un número mayor que 0." }, 400);
		}
		patch.base_salary = Math.round(baseSalaryCents) / 100;
	}

	if (body?.ideal_monthly_income_cents !== undefined) {
		const ideal = Math.round(Number(body.ideal_monthly_income_cents));
		if (!Number.isInteger(ideal) || ideal < 0) {
			return json(
				{ error: "`ideal_monthly_income_cents` debe ser un entero >= 0." },
				422,
			);
		}
		patch.ideal_monthly_income_cents = ideal;
	}

	if (Object.keys(patch).length === 0) {
		return json({ error: "No hay nada que actualizar." }, 400);
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
	if (!user) return json({ error: "No autenticado." }, 401);

	const { data, error } = await supabase
		.from("profiles")
		.update(patch)
		.eq("id", user.id)
		.select("first_name, base_salary, ideal_monthly_income_cents")
		.maybeSingle();

	if (error) return json({ error: error.message }, 500);

	return json({ ok: true, profile: data }, 200);
}
