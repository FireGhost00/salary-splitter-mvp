import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "../../lib/supabase.js";
import { SYS_CAT, monthlyProvisionCents, splitIncome } from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";
import { checkRateLimit, rateLimitResponse } from "../../lib/rate-limit.js";
import { withLogging } from "../../lib/logger.js";

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
 * Reparte `total` (entero) entre `weights` proporcionalmente, con Math.floor y
 * el residuo a los pesos más grandes (§2). Devuelve enteros que suman `total`.
 */
function distribute(total, weights) {
	const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0);
	if (total <= 0 || sumW <= 0) return weights.map(() => 0);
	const out = weights.map((w) => Math.floor((total * Math.max(0, w)) / sumW));
	let residue = total - out.reduce((a, b) => a + b, 0);
	const order = weights
		.map((w, i) => i)
		.sort((a, b) => weights[b] - weights[a]);
	for (let k = 0; residue > 0 && order.length > 0; k++, residue--) {
		out[order[k % order.length]] += 1;
	}
	return out;
}

/**
 * POST /api/register-income
 * Body: { amount_cents: number }  — el ingreso real, en centavos enteros.
 *
 * 1. Reparte 50/30/20 (Necesidad / Deseo / Ahorro).
 * 2. Dentro del 50 % de Necesidad, primero se abona a la Deuda y la Provisión.
 * 3. ABONO PARCIAL: si ese 50 % no alcanza para lo que falta del mes, se abona
 *    íntegro a Deuda/Provisión y Necesidad libre queda en $0. NUNCA se bloquea.
 * 4. INSERT masivo: una transacción de ingreso por sobre tocado; la respuesta
 *    incluye `partial` y `split.still_uncovered_cents`.
 */
async function handlePOST(context) {
	// Validación de forma del payload (400 con { error } en español).
	// `amount_cents`: entero de centavos estricto (Patrón Money §2/§4).
	// `effective_date`: opcional; determina el mes cuyo remanente fijo
	// (deuda/provisión) se evalúa y la fecha de TODAS las filas del ingreso.
	let amountCents;
	let effectiveDate;
	try {
		const body = await parseJsonBody(context.request);
		amountCents = v.intCents(body.amount_cents, "amount_cents", { min: 1 });
		effectiveDate =
			v.optionalIsoDate(body.effective_date, "effective_date") ?? localDateISO();
	} catch (e) {
		if (e instanceof ValidationError) return jsonError(e.message);
		throw e;
	}

	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	// Rate limiting en memoria (badén anti-abuso; ver src/lib/rate-limit.js).
	const rl = await checkRateLimit(`${user.id}:register-income`);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

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
		.select("id, label, annual_amount_cents")
		.eq("user_id", user.id);
	if (provError) return json({ error: provError.message }, 500);

	const items = (provItems ?? []).map((it) => ({
		id: it.id,
		label: it.label,
		annual: Math.max(0, Number(it.annual_amount_cents) || 0),
	}));

	const debtCents =
		cfg?.debt_enabled === true ? Number(cfg.debt_monthly_cents) || 0 : 0;
	const provisionsEnabled = cfg?.provisions_enabled === true;
	const provisionCents = provisionsEnabled
		? monthlyProvisionCents(provItems ?? [])
		: 0;

	// --- PASO 3 (turno previo): memoria mensual -----------------------
	// El mes se toma de la fecha efectiva elegida, no del reloj: un ingreso
	// retroactivo se contabiliza contra el remanente fijo de SU mes.
	const p2 = (n) => String(n).padStart(2, "0");
	const [effYear, effMonth] = effectiveDate.split("-").map(Number);
	const monthStart = `${effYear}-${p2(effMonth)}-01`;
	const lastDay = new Date(effYear, effMonth, 0);
	const monthEnd = `${lastDay.getFullYear()}-${p2(lastDay.getMonth() + 1)}-${p2(lastDay.getDate())}`;

	// Deuda ya cubierta este mes.
	const { data: paidDebtRows, error: paidDebtErr } = await supabase
		.from("transactions")
		.select("amount_cents")
		.eq("user_id", user.id)
		.eq("transaction_type", "ingreso")
		.eq("category_id", SYS_CAT.deuda)
		.gte("effective_date", monthStart)
		.lte("effective_date", monthEnd);
	if (paidDebtErr) return json({ error: paidDebtErr.message }, 500);
	const paidDebt = (paidDebtRows ?? []).reduce(
		(s, r) => s + Math.max(0, Number(r.amount_cents ?? 0)),
		0,
	);

	// Provisión ya cubierta este mes, POR RUBRO (provision_item_id).
	const paidByItem = {};
	if (items.length > 0) {
		const { data: paidProvRows, error: paidProvErr } = await supabase
			.from("transactions")
			.select("provision_item_id, amount_cents")
			.eq("user_id", user.id)
			.eq("transaction_type", "ingreso")
			.in(
				"provision_item_id",
				items.map((i) => i.id),
			)
			.gte("effective_date", monthStart)
			.lte("effective_date", monthEnd);
		if (paidProvErr) return json({ error: paidProvErr.message }, 500);
		for (const r of paidProvRows ?? []) {
			paidByItem[r.provision_item_id] =
				(paidByItem[r.provision_item_id] ?? 0) +
				Math.max(0, Number(r.amount_cents ?? 0));
		}
	}

	// Meta mensual por rubro (suma exacta = provisionCents) y lo que falta.
	const itemMonthlyTarget = provisionsEnabled
		? distribute(
				provisionCents,
				items.map((i) => i.annual),
			)
		: items.map(() => 0);
	const itemToCover = items.map((it, i) =>
		Math.max(0, itemMonthlyTarget[i] - (paidByItem[it.id] ?? 0)),
	);

	// Solo se descuenta hasta el tope del mes; el resto va a 50/30/20.
	const debtToCover = Math.max(0, debtCents - paidDebt);
	const provisionToCover = itemToCover.reduce((a, b) => a + b, 0);
	const paidProvision = items.reduce(
		(s, it) => s + (paidByItem[it.id] ?? 0),
		0,
	);
	const alreadyPaidFixed = paidDebt + paidProvision;

	// --- Reparto --------------------------------------------------------
	const split = splitIncome(amountCents, {
		debtCents: debtToCover,
		provisionCents: provisionToCover,
	});

	// ABONO PARCIAL: si el 50 % no cubre todo lo fijo por pagar, `splitIncome`
	// ya asignó ese 50 % completo a Deuda/Provisión y dejó Necesidad libre en $0.
	// El ingreso se registra igual (no se bloquea nada).

	// Categorías opcionales necesarias solo si este ingreso realmente las toca.
	if (split.fixed.debt_cents > 0 && !catNames.has(SYS_CAT.deuda)) {
		return json(
			{ error: `Falta la categoría "${SYS_CAT.deuda}". Guarda la configuración.` },
			409,
		);
	}
	if (split.fixed.provision_cents > 0 && !catNames.has(SYS_CAT.provision)) {
		return json(
			{
				error: `Falta la categoría "${SYS_CAT.provision}". Guarda la configuración.`,
			},
			409,
		);
	}

	const today = effectiveDate;
	// PASO 2: un único id para TODAS las transacciones de este ingreso, para
	// poder borrar el bloque de un golpe desde el Historial.
	const groupId = randomUUID();
	const mkRow = (name, cents, provisionItemId = null, labelText = null) => ({
		user_id: user.id,
		category_id: name, // nombre: monthly_balances / DashboardCharts cruzan por nombre
		provision_item_id: provisionItemId,
		group_id: groupId,
		label: labelText ?? `Ingreso → ${name}`,
		amount_cents: cents,
		transaction_type: "ingreso",
		effective_date: today,
	});

	const rows = [];
	if (split.necesidad_free_cents > 0)
		rows.push(mkRow(SYS_CAT.necesidad, split.necesidad_free_cents));
	if (split.fixed.debt_cents > 0)
		rows.push(mkRow(SYS_CAT.deuda, split.fixed.debt_cents));

	// Provisión: se reparte entre rubros según lo que falta por cubrir de cada uno.
	if (split.fixed.provision_cents > 0) {
		const itemAlloc = distribute(split.fixed.provision_cents, itemToCover);
		items.forEach((it, i) => {
			if (itemAlloc[i] > 0) {
				rows.push(
					mkRow(SYS_CAT.provision, itemAlloc[i], it.id, `Ingreso → ${it.label}`),
				);
			}
		});
	}

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
			partial: split.partial,
			count: inserted?.length ?? rows.length,
			group_id: groupId,
			split: {
				income_cents: split.income_cents,
				necesidad_total_cents: split.shares.necesidad,
				necesidad_free_cents: split.necesidad_free_cents,
				debt_cents: split.fixed.debt_cents,
				provision_cents: split.fixed.provision_cents,
				deseo_cents: split.shares.deseo,
				ahorro_cents: split.shares.ahorro,
				already_paid_fixed_cents: alreadyPaidFixed,
				still_uncovered_cents: split.over_cents,
			},
		},
		200,
	);
}

export const POST = withLogging("register-income", handlePOST);
