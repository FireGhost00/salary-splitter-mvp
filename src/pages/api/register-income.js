import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SYS_CAT, monthlyProvisionCents, splitIncome } from "../../lib/budget.js";

// Ruta on-demand: reparte un ingreso con el modelo 50/30/20. Deuda y Provisión
// Mensual se absorben dentro del 50 % de Necesidad. Protegida por SSR.
export const prerender = false;

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
 * POST /api/register-income
 * Body: { amount_cents: number }  — el ingreso real, en centavos enteros.
 *
 * 1. Reparte 50/30/20 (Necesidad / Deseo / Ahorro).
 * 2. Dentro de Necesidad, primero se paga la Deuda y la Provisión Mensual.
 * 3. Si Deuda + Provisión Mensual > 50 % del ingreso => 409 { deficit: true } y
 *    NO se registra nada (el front muestra la alerta).
 * 4. Si no, INSERT masivo: una transacción de ingreso por sobre tocado, todas
 *    sumando exactamente el ingreso.
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const amountCents = Number(body?.amount_cents);
	if (!Number.isInteger(amountCents) || amountCents <= 0) {
		return json({ error: "`amount_cents` debe ser un entero mayor que 0." }, 400);
	}

	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	// --- Datos ------------------------------------------------------------
	const { data: catRows, error: catError } = await supabase
		.from("categories")
		.select("name")
		.eq("user_id", user.id);
	if (catError) return json({ error: catError.message }, 500);
	const catNames = new Set((catRows ?? []).map((c) => c.name));

	const missingCore = [SYS_CAT.necesidad, SYS_CAT.deseo, SYS_CAT.ahorro].filter(
		(n) => !catNames.has(n),
	);
	if (missingCore.length > 0) {
		return json(
			{
				error: `Faltan categorías del sistema: ${missingCore.join(", ")}. Guarda la configuración primero.`,
			},
			409,
		);
	}

	const { data: cfg, error: cfgError } = await supabase
		.from("budget_config")
		.select("debt_enabled, debt_monthly_cents, provisions_enabled")
		.eq("user_id", user.id)
		.maybeSingle();
	if (cfgError) return json({ error: cfgError.message }, 500);

	const { data: provItems, error: provError } = await supabase
		.from("provision_items")
		.select("annual_amount_cents")
		.eq("user_id", user.id);
	if (provError) return json({ error: provError.message }, 500);

	const debtCents =
		cfg?.debt_enabled === true ? Number(cfg.debt_monthly_cents) || 0 : 0;
	const provisionCents =
		cfg?.provisions_enabled === true
			? monthlyProvisionCents(provItems ?? [])
			: 0;

	// --- Reparto --------------------------------------------------------
	const split = splitIncome(amountCents, { debtCents, provisionCents });

	if (split.deficit) {
		return json(
			{
				error:
					"Presupuesto en déficit: la Deuda y la Provisión Mensual superan el 50 % de este ingreso.",
				deficit: true,
				detail: {
					income_cents: split.income_cents,
					necesidad_cents: split.shares.necesidad,
					debt_cents: split.fixed.debt_cents,
					provision_cents: split.fixed.provision_cents,
					fixed_cents: split.fixed.total_cents,
					over_cents: split.over_cents,
				},
			},
			409,
		);
	}

	// Categorías opcionales necesarias para este ingreso.
	if (debtCents > 0 && !catNames.has(SYS_CAT.deuda)) {
		return json(
			{ error: `Falta la categoría "${SYS_CAT.deuda}". Guarda la configuración.` },
			409,
		);
	}
	if (provisionCents > 0 && !catNames.has(SYS_CAT.provision)) {
		return json(
			{
				error: `Falta la categoría "${SYS_CAT.provision}". Guarda la configuración.`,
			},
			409,
		);
	}

	const today = localDateISO();
	const mkRow = (name, cents) => ({
		user_id: user.id,
		category_id: name, // nombre: monthly_balances / DashboardCharts cruzan por nombre
		label: `Ingreso → ${name}`,
		amount_cents: cents,
		transaction_type: "ingreso",
		effective_date: today,
	});

	const rows = [];
	if (split.necesidad_free_cents > 0)
		rows.push(mkRow(SYS_CAT.necesidad, split.necesidad_free_cents));
	if (split.fixed.debt_cents > 0)
		rows.push(mkRow(SYS_CAT.deuda, split.fixed.debt_cents));
	if (split.fixed.provision_cents > 0)
		rows.push(mkRow(SYS_CAT.provision, split.fixed.provision_cents));
	if (split.shares.deseo > 0) rows.push(mkRow(SYS_CAT.deseo, split.shares.deseo));
	if (split.shares.ahorro > 0)
		rows.push(mkRow(SYS_CAT.ahorro, split.shares.ahorro));

	if (rows.length === 0) {
		return json({ error: "El ingreso es demasiado pequeño para repartir." }, 400);
	}

	const { data: inserted, error: insertError } = await supabase
		.from("transactions")
		.insert(rows)
		.select("id");
	if (insertError) return json({ error: insertError.message }, 500);

	return json(
		{
			ok: true,
			deficit: false,
			count: inserted?.length ?? rows.length,
			split: {
				income_cents: split.income_cents,
				necesidad_total_cents: split.shares.necesidad,
				necesidad_free_cents: split.necesidad_free_cents,
				debt_cents: split.fixed.debt_cents,
				provision_cents: split.fixed.provision_cents,
				deseo_cents: split.shares.deseo,
				ahorro_cents: split.shares.ahorro,
			},
		},
		200,
	);
}
