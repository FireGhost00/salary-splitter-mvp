import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: necesita ejecutarse en el servidor para insertar en Supabase.
// El resto del sitio sigue siendo estático (CONVENCIONES.md §1).
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Fecha local de hoy como YYYY-MM-DD (sin desfase de zona horaria). */
function localDateISO(d = new Date()) {
	const pad2 = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Categorías maestras a las que puede caer un sobregiro. */
const MASTER_FALLBACKS = new Set(["Necesidad", "Deseo", "Ahorro"]);

/**
 * POST /api/expense
 * Body: {
 *   amount_cents?: number (entero > 0, preferente) | amount?: number (dólares > 0),
 *   category_id: string, label?: string, description?: string,
 *   fallback_category_id?: string   // si el gasto sobregira, de aquí sale el resto
 * }
 * Registra un gasto en `transactions` con el monto en centavos NEGATIVOS.
 * Si hay `fallback_category_id` y el gasto supera el saldo disponible de
 * `category_id`, la transacción se PARTE: una parte vacía la categoría original
 * y el remanente va contra la categoría maestra de respaldo.
 */
export async function POST(context) {
	const { request } = context;
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const { amount, amount_cents, category_id, label, description } = body ?? {};
	const fallbackCategoryId =
		typeof body?.fallback_category_id === "string"
			? body.fallback_category_id.trim()
			: "";
	// Rubro de provisión concreto (opcional). El gasto se asocia a este id y
	// category_id sigue siendo "Provisiones" para el sobre agregado.
	const provItemId =
		typeof body?.provision_item_id === "string" && body.provision_item_id.trim()
			? body.provision_item_id.trim()
			: null;
	// Subcategoría (opcional). El gasto descuenta del master (category_id) y aquí
	// se guarda solo para análisis.
	const subcategory =
		typeof body?.subcategory === "string" && body.subcategory.trim()
			? body.subcategory.trim()
			: null;

	// Monto bruto del gasto en centavos enteros positivos.
	let grossCents;
	if (amount_cents !== undefined) {
		if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
			return json(
				{ error: "`amount_cents` debe ser un entero mayor que 0." },
				400,
			);
		}
		grossCents = amount_cents;
	} else if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
		grossCents = Math.round(amount * 100);
	} else {
		return json(
			{ error: "Falta `amount_cents` (entero > 0) o `amount` (> 0)." },
			400,
		);
	}

	if (typeof category_id !== "string" || category_id.trim() === "") {
		return json({ error: "`category_id` es obligatorio." }, 400);
	}

	const finalLabel =
		typeof label === "string" && label.trim() !== "" ? label.trim() : "Gasto";
	const finalDescription =
		typeof description === "string" && description.trim() !== ""
			? description.trim()
			: null;

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

	// Si viene un rubro de provisión, tiene que ser del usuario.
	if (provItemId) {
		const { data: itemRow, error: itemErr } = await supabase
			.from("provision_items")
			.select("id")
			.eq("user_id", user.id)
			.eq("id", provItemId)
			.maybeSingle();
		if (itemErr) return json({ error: itemErr.message }, 500);
		if (!itemRow) {
			return json({ error: "El rubro de provisión no existe." }, 422);
		}
	}

	const today = localDateISO();
	const baseRow = {
		label: finalLabel,
		description: finalDescription,
		transaction_type: "gasto",
		effective_date: today,
	};

	// --- Camino simple: sin fallback -> un solo gasto -------------------
	const wantsSplit =
		fallbackCategoryId !== "" && fallbackCategoryId !== category_id;

	if (!wantsSplit) {
		const { data, error } = await supabase
			.from("transactions")
			.insert({
				...baseRow,
				category_id,
				provision_item_id: provItemId,
				subcategory,
				amount_cents: -Math.abs(grossCents),
			})
			.select()
			.single();
		if (error) return json({ error: error.message }, 500);
		return json({ transaction: data }, 200);
	}

	// --- Camino con sobregiro ------------------------------------------
	if (!MASTER_FALLBACKS.has(fallbackCategoryId)) {
		return json(
			{ error: "La categoría de respaldo debe ser Necesidad, Deseo o Ahorro." },
			422,
		);
	}

	// macro_type de la categoría original: define cómo se calcula "disponible".
	const { data: catRow, error: catErr } = await supabase
		.from("categories")
		.select("macro_type")
		.eq("user_id", user.id)
		.eq("name", category_id)
		.maybeSingle();
	if (catErr) return json({ error: catErr.message }, 500);

	const isProvision =
		provItemId != null ||
		catRow?.macro_type === "provision" ||
		category_id === "Provisiones";

	// Saldo disponible (autoritativo, se recalcula en el server):
	// - rubro de provisión -> acumulado de ESE rubro (provision_item_id)
	// - provisión agregada  -> acumulado de todos los meses
	// - resto               -> mes en curso
	let sumQuery = supabase
		.from("transactions")
		.select("amount_cents, effective_date")
		.eq("user_id", user.id);
	sumQuery = provItemId
		? sumQuery.eq("provision_item_id", provItemId)
		: sumQuery.eq("category_id", category_id);
	const { data: sumRows, error: sumErr } = await sumQuery;
	if (sumErr) return json({ error: sumErr.message }, 500);

	const monthPrefix = today.slice(0, 7); // "YYYY-MM"
	let sum = 0;
	for (const row of sumRows ?? []) {
		if (isProvision || String(row.effective_date).slice(0, 7) === monthPrefix) {
			sum += Number(row.amount_cents ?? 0);
		}
	}
	const availableCents = Math.max(0, sum);

	// Si en realidad no sobregira, un solo gasto normal.
	if (grossCents <= availableCents) {
		const { data, error } = await supabase
			.from("transactions")
			.insert({
				...baseRow,
				category_id,
				provision_item_id: provItemId,
				subcategory,
				amount_cents: -grossCents,
			})
			.select()
			.single();
		if (error) return json({ error: error.message }, 500);
		return json({ transaction: data }, 200);
	}

	// Partir: parte contra la categoría/rubro original (lo deja en 0) +
	// remanente contra la maestra de respaldo.
	const remainderCents = grossCents - availableCents;
	const rows = [];
	if (availableCents > 0) {
		rows.push({
			...baseRow,
			category_id,
			provision_item_id: provItemId,
			subcategory,
			amount_cents: -availableCents,
		});
	}
	rows.push({
		...baseRow,
		category_id: fallbackCategoryId,
		label: `${finalLabel} (sobregiro)`,
		amount_cents: -remainderCents,
	});

	const { data: inserted, error: insErr } = await supabase
		.from("transactions")
		.insert(rows)
		.select();
	if (insErr) return json({ error: insErr.message }, 500);

	return json(
		{
			transactions: inserted,
			split: {
				from_category_cents: availableCents,
				from_fallback_cents: remainderCents,
				fallback_category_id: fallbackCategoryId,
			},
		},
		200,
	);
}
