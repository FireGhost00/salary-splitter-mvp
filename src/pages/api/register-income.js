import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: reparte un ingreso real en CASCADA (deuda -> provisión -> %).
// Protegida por SSR.
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
 * POST /api/register-income
 * Body: { amount_cents: number }  — el ingreso real, en centavos enteros.
 *
 * Cascada (Waterfall) con el ingreso recibido:
 *   1. macro_type = 'deuda'     -> se rellena cada categoría hasta su target_amount.
 *   2. macro_type = 'provision' -> se asigna cada target_amount.
 *   3. Con el remanente -> reparto por porcentajes de distribution_rules.
 * El "ya asignado este mes" se descuenta para no rellenar de más si hay varios
 * ingresos en el mismo mes. Todo entero (§2). INSERT masivo al final.
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
		return json(
			{ error: "`amount_cents` debe ser un entero mayor que 0." },
			400,
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

	// --- Datos ---------------------------------------------------------------
	// Decisión arquitectónica: TODA relación cruza por el id (UUID) de la
	// categoría, nunca por el nombre en texto plano.
	const { data: cats, error: catError } = await supabase
		.from("categories")
		.select("id, name, macro_type, target_amount")
		.eq("user_id", user.id);
	if (catError) return json({ error: catError.message }, 500);

	// Índice UUID -> categoría, para etiquetas legibles y validación de reglas.
	const catById = new Map((cats ?? []).map((c) => [c.id, c]));

	const { data: rules, error: rulesError } = await supabase
		.from("distribution_rules")
		.select("category_id, percentage")
		.eq("user_id", user.id);
	if (rulesError) return json({ error: rulesError.message }, 500);

	// Ya asignado este mes por categoría (para no rellenar de más). La llave del
	// mapa es el UUID de la categoría (transactions.category_id ya es UUID).
	const now = new Date();
	const p2 = (n) => String(n).padStart(2, "0");
	const monthStart = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-01`;
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const monthEnd = `${lastDay.getFullYear()}-${p2(lastDay.getMonth() + 1)}-${p2(lastDay.getDate())}`;

	const { data: monthTx, error: monthTxError } = await supabase
		.from("transactions")
		.select("category_id, amount_cents")
		.eq("user_id", user.id)
		.gte("effective_date", monthStart)
		.lte("effective_date", monthEnd);
	if (monthTxError) return json({ error: monthTxError.message }, 500);

	const allocatedThisMonth = {};
	for (const tx of monthTx ?? []) {
		const c = Number(tx.amount_cents);
		if (c > 0 && tx.category_id != null) {
			allocatedThisMonth[tx.category_id] =
				(allocatedThisMonth[tx.category_id] ?? 0) + c;
		}
	}

	// --- Cascada ------------------------------------------------------------
	let remaining = amountCents;
	// `category_id` es siempre el UUID de la categoría.
	/** @type {{category_id: string, amount_cents: number}[]} */
	const allocations = [];

	function fillPhase(macroType) {
		const phase = (cats ?? [])
			.filter(
				(c) => c.macro_type === macroType && Number(c.target_amount) > 0,
			)
			.sort((a, b) => String(a.name).localeCompare(String(b.name)));

		for (const c of phase) {
			if (remaining <= 0) break;
			const target = Math.round(Number(c.target_amount));
			const already = allocatedThisMonth[c.id] ?? 0;
			const give = Math.min(Math.max(0, target - already), remaining);
			if (give > 0) {
				allocations.push({ category_id: c.id, amount_cents: give });
				remaining -= give;
			}
		}
	}

	fillPhase("deuda"); // 1
	fillPhase("provision"); // 2

	// 3. Remanente por porcentajes. Si queda dinero, las reglas son obligatorias
	// y deben sumar 100 (así no se pierde ni un centavo).
	if (remaining > 0) {
		if (!rules || rules.length === 0) {
			return json(
				{
					error:
						"Queda ingreso sin repartir y no hay reglas de distribución (%).",
				},
				409,
			);
		}
		// Toda regla debe apuntar a un UUID de categoría existente del usuario.
		const orphan = rules.find((r) => !catById.has(r.category_id));
		if (orphan) {
			return json(
				{
					error: `Una regla apunta a una categoría inexistente (${orphan.category_id}).`,
				},
				422,
			);
		}

		const badPct = rules.some(
			(r) =>
				!Number.isInteger(r.percentage) ||
				r.percentage <= 0 ||
				r.percentage > 100,
		);
		if (badPct) {
			return json({ error: "Alguna regla tiene un porcentaje inválido." }, 422);
		}
		const totalPct = rules.reduce((s, r) => s + r.percentage, 0);
		if (totalPct !== 100) {
			return json(
				{ error: `Los porcentajes deben sumar 100 (suman ${totalPct}).` },
				422,
			);
		}

		const pctAlloc = rules.map((r) => ({
			category_id: r.category_id,
			amount_cents: Math.floor((remaining * r.percentage) / 100),
		}));
		const dist = pctAlloc.reduce((s, a) => s + a.amount_cents, 0);
		const residue = remaining - dist; // >= 0 por el floor
		if (residue > 0) {
			let top = 0;
			for (let i = 1; i < rules.length; i++) {
				if (rules[i].percentage > rules[top].percentage) top = i;
			}
			pctAlloc[top].amount_cents += residue;
		}
		for (const a of pctAlloc) {
			if (a.amount_cents > 0) allocations.push(a);
		}
		remaining = 0;
	}

	if (allocations.length === 0) {
		return json(
			{ error: "No hay dónde asignar el ingreso (sin objetivos ni reglas)." },
			409,
		);
	}

	// Fusiona por UUID de categoría (una fase y los % pueden tocar la misma).
	const merged = {};
	for (const a of allocations) {
		merged[a.category_id] = (merged[a.category_id] ?? 0) + a.amount_cents;
	}

	const today = localDateISO();
	const inserts = Object.entries(merged).map(([category_id, cents]) => ({
		user_id: user.id,
		category_id, // UUID -> transactions.category_id (FK a categories.id)
		label: `Ingreso → ${catById.get(category_id)?.name ?? category_id}`,
		amount_cents: cents,
		transaction_type: "ingreso",
		effective_date: today,
	}));

	const { data: inserted, error: insertError } = await supabase
		.from("transactions")
		.insert(inserts)
		.select("id");

	if (insertError) {
		return json({ error: insertError.message }, 500);
	}

	return json(
		{
			ok: true,
			count: inserted?.length ?? inserts.length,
			distributed_cents: amountCents - remaining,
		},
		200,
	);
}
