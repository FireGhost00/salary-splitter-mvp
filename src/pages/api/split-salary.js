import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: reparte el salario base del usuario entre sus reglas.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Fecha local de hoy como YYYY-MM-DD. */
function localDateISO(d = new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * POST /api/split-salary
 * Sin body. Lee `profiles.base_salary` y `distribution_rules` del usuario de la
 * sesión, y crea una transacción de ingreso por regla (INSERT masivo).
 */
export async function POST(context) {
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

	// 1) Salario base del perfil.
	const { data: profile, error: profileError } = await supabase
		.from("profiles")
		.select("base_salary")
		.eq("id", user.id)
		.maybeSingle();

	if (profileError) {
		return json({ error: profileError.message }, 500);
	}

	// `numeric` llega como string en supabase-js -> Number().
	const baseSalary = Number(profile?.base_salary ?? 0);
	if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
		return json(
			{ error: "El perfil no tiene un base_salary válido. Configúralo primero." },
			400,
		);
	}

	// 2) Reglas de distribución.
	const { data: rules, error: rulesError } = await supabase
		.from("distribution_rules")
		.select("category_id, percentage")
		.eq("user_id", user.id);

	if (rulesError) {
		return json({ error: rulesError.message }, 500);
	}
	if (!rules || rules.length === 0) {
		return json({ error: "No hay reglas de distribución configuradas." }, 409);
	}

	const hasInvalidPct = rules.some(
		(r) =>
			!Number.isInteger(r.percentage) ||
			r.percentage <= 0 ||
			r.percentage > 100,
	);
	if (hasInvalidPct) {
		return json({ error: "Alguna regla tiene un porcentaje inválido." }, 422);
	}

	const totalPct = rules.reduce((sum, r) => sum + r.percentage, 0);
	if (totalPct !== 100) {
		return json(
			{ error: `Los porcentajes deben sumar 100 (suman ${totalPct}).` },
			422,
		);
	}

	// 3) Monto por regla: (base_salary * percentage / 100) * 100 = base_salary * percentage.
	//    Math.round explícito -> centavos enteros (CONVENCIONES.md §2).
	const allocations = rules.map((rule) => ({
		category_id: rule.category_id,
		amount_cents: Math.round(baseSalary * rule.percentage),
	}));

	// §2: el residuo de los redondeos se suma al sobre con mayor porcentaje para
	// que la suma cuadre exactamente con base_salary * 100.
	const salaryCents = Math.round(baseSalary * 100);
	const distributed = allocations.reduce((s, a) => s + a.amount_cents, 0);
	const residue = salaryCents - distributed;
	if (residue !== 0) {
		const topIdx = rules.reduce(
			(best, r, i, arr) => (r.percentage > arr[best].percentage ? i : best),
			0,
		);
		allocations[topIdx].amount_cents += residue;
	}

	// 4) INSERT masivo.
	const today = localDateISO();
	const rows = allocations.map((a) => ({
		user_id: user.id,
		category_id: a.category_id,
		label: `Salario → ${a.category_id}`,
		amount_cents: a.amount_cents,
		transaction_type: "ingreso",
		effective_date: today,
	}));

	const { data: inserted, error: insertError } = await supabase
		.from("transactions")
		.insert(rows)
		.select("id");

	if (insertError) {
		return json({ error: insertError.message }, 500);
	}

	return json(
		{ ok: true, count: inserted?.length ?? rows.length, total_cents: salaryCents },
		200,
	);
}
