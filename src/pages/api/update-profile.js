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
 * Body: { first_name: string, base_salary: number }  (base_salary en CENTAVOS;
 * el form lo multiplica por 100 antes de enviar). Se persiste en dólares para
 * mantener la consistencia con onboarding / dashboard / split-salary.
 * UPSERT en `profiles` ligado al user_id de la sesión.
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const firstName =
		typeof body?.first_name === "string" ? body.first_name.trim() : "";
	const baseSalaryCents = Number(body?.base_salary);

	if (!firstName) {
		return json({ error: "`first_name` es obligatorio." }, 400);
	}
	if (!Number.isFinite(baseSalaryCents) || baseSalaryCents <= 0) {
		return json({ error: "`base_salary` debe ser un número mayor que 0." }, 400);
	}

	// Centavos -> dólares (2 decimales) para guardar.
	const baseSalary = Math.round(baseSalaryCents) / 100;

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
		.from("profiles")
		.upsert({ id: user.id, first_name: firstName, base_salary: baseSalary })
		.select("first_name, base_salary")
		.single();

	if (error) {
		return json({ error: error.message }, 500);
	}

	return json({ ok: true, profile: data }, 200);
}
