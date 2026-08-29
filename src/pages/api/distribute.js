import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: inserta en Supabase. El resto del sitio sigue estático (CONVENCIONES.md §1).
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const pad2 = (n) => String(n).padStart(2, "0");

/** Fecha local de hoy como YYYY-MM-DD (sin desfase de zona horaria). */
function localDateISO(d = new Date()) {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Día 1 del mes siguiente como YYYY-MM-DD (con rollover de año). */
function firstDayOfNextMonthISO(d = new Date()) {
	const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
	return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`;
}

/**
 * Reparte `salaryCents` entre las reglas según su porcentaje.
 *
 * Patrón Money (CONVENCIONES.md §2): se multiplica sobre centavos ENTEROS y se
 * trunca con Math.floor(). El residuo que deja el truncado se suma al sobre con
 * mayor porcentaje para que la suma cuadre exactamente con el salario.
 *
 * @param {number} salaryCents  Salario en centavos (entero).
 * @param {{ category_id: string, category_name: string | null, percentage: number }[]} rules
 * @returns {{ allocations: { category_id: string, category_name: string | null, percentage: number, amount_cents: number }[], residueCents: number, residueCategoryId: string | null }}
 */
function computeAllocations(salaryCents, rules) {
	const allocations = rules.map((rule) => ({
		category_id: rule.category_id,
		category_name: rule.category_name,
		percentage: rule.percentage,
		// salaryCents * percentage es entero exacto; /100 + floor => entero.
		amount_cents: Math.floor((salaryCents * rule.percentage) / 100),
	}));

	const distributed = allocations.reduce((sum, a) => sum + a.amount_cents, 0);
	const residueCents = salaryCents - distributed;

	let residueCategoryId = null;
	if (residueCents > 0) {
		const target = allocations.reduce((max, a) =>
			a.percentage > max.percentage ? a : max,
		);
		target.amount_cents += residueCents;
		residueCategoryId = target.category_id;
	}

	return { allocations, residueCents, residueCategoryId };
}

/**
 * POST /api/distribute
 * Body: { salary: number, cycle: "Q1" | "Q2" }  (salario en la moneda)
 *
 * Convierte el salario a centavos, lee las reglas del usuario, calcula las
 * fracciones (Math.floor) e inserta una transacción por sobre en bloque.
 */
export async function POST(context) {
	const { request } = context;

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const { salary, quincena } = body ?? {};
	// Se extrae `cycle` del request (retrocompat: el modal aún envía `quincena`).
	const cycle = body?.cycle ?? quincena;

	if (typeof salary !== "number" || !Number.isFinite(salary) || salary <= 0) {
		return json({ error: "`salary` debe ser un número mayor que 0." }, 400);
	}
	// `cycle` determina el label de cada transacción.
	if (cycle !== "Q1" && cycle !== "Q2") {
		return json({ error: "`cycle` debe ser 'Q1' o 'Q2'." }, 400);
	}

	// US-15: si `apply_next_month` es true => día 1 del próximo mes; si no => hoy.
	const effectiveDate =
		body?.apply_next_month === true
			? firstDayOfNextMonthISO()
			: localDateISO();

	// Conversión a centavos enteros (x100). Math.round explícito, sin coma flotante después.
	const salaryCents = Math.round(salary * 100);
	if (salaryCents <= 0) {
		return json({ error: "El salario es demasiado pequeño." }, 400);
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

	// Reglas de distribución del usuario (RLS filtra por auth.uid()).
	// Se embebe el nombre de la categoría (FK category_id -> categories.id).
	const { data: rulesRaw, error: rulesError } = await supabase
		.from("distribution_rules")
		.select("category_id, percentage, categories(name)");

	if (rulesError) {
		return json({ error: rulesError.message }, 500);
	}
	if (!rulesRaw || rulesRaw.length === 0) {
		return json({ error: "No hay reglas de distribución configuradas." }, 409);
	}

	// Normaliza el embed (objeto o array según PostgREST) a un nombre plano.
	const rules = rulesRaw.map((rule) => {
		const related = Array.isArray(rule.categories)
			? rule.categories[0]
			: rule.categories;
		return {
			category_id: rule.category_id,
			percentage: rule.percentage,
			// null si no se pudo resolver el nombre -> el label cae al formato corto.
			category_name: related?.name ?? null,
		};
	});

	const hasInvalidPercentage = rules.some(
		(rule) =>
			!Number.isInteger(rule.percentage) ||
			rule.percentage <= 0 ||
			rule.percentage > 100,
	);
	if (hasInvalidPercentage) {
		return json({ error: "Alguna regla tiene un porcentaje inválido." }, 422);
	}

	const totalPercentage = rules.reduce((sum, rule) => sum + rule.percentage, 0);
	if (totalPercentage !== 100) {
		return json(
			{ error: `Los porcentajes deben sumar 100 (suman ${totalPercentage}).` },
			422,
		);
	}

	const { allocations, residueCents, residueCategoryId } = computeAllocations(
		salaryCents,
		rules,
	);

	// Inserción en bloque: una transacción de ingreso por sobre.
	// Label dinámico con template literals. Si hay nombre de categoría:
	// `Distribución ${cycle} - ${categoryName}`; si no, `Distribución ${cycle}`.
	const rows = allocations.map((allocation) => {
		const categoryName = allocation.category_name;
		const label = categoryName
			? `Distribución ${cycle} - ${categoryName}`
			: `Distribución ${cycle}`;

		return {
			category_id: allocation.category_id,
			label,
			amount_cents: allocation.amount_cents,
			transaction_type: "ingreso",
			effective_date: effectiveDate,
		};
	});

	const { data: inserted, error: insertError } = await supabase
		.from("transactions")
		.insert(rows)
		.select();

	if (insertError) {
		return json({ error: insertError.message }, 500);
	}

	return json(
		{
			salary_cents: salaryCents,
			residue_cents: residueCents,
			residue_category_id: residueCategoryId,
			allocations,
			transactions: inserted,
		},
		200,
	);
}
