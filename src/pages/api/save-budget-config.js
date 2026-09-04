import { createSupabaseServerClient } from "../../lib/supabase.js";
import {
	CORE_CATEGORIES,
	OPTIONAL_CATEGORIES,
	SYS_CAT,
	monthlyProvisionCents,
} from "../../lib/budget.js";
import {
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../../lib/validation.js";
import { checkRateLimit, rateLimitResponse } from "../../lib/rate-limit.js";
import { withLogging } from "../../lib/logger.js";

// Ruta on-demand: guarda la config del presupuesto (deuda + provisiones).
// Protegida por SSR.
export const prerender = false;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Siembra (idempotente) las categorías del sistema: las 3 fijas siempre, y
 * Deuda / Provisiones solo si su toggle está activo. Requiere UNIQUE
 * (user_id, name) en `categories`.
 */
async function ensureSystemCategories(supabase, userId, { debt, provisions }) {
	const wanted = [...CORE_CATEGORIES];
	if (debt) wanted.push(OPTIONAL_CATEGORIES.find((c) => c.name === SYS_CAT.deuda));
	if (provisions)
		wanted.push(OPTIONAL_CATEGORIES.find((c) => c.name === SYS_CAT.provision));

	const rows = wanted.map((c) => ({
		user_id: userId,
		name: c.name,
		macro_type: c.macro_type,
		// Columna legacy `type`: por seguridad se envía siempre, aunque ya no
		// tenga NOT NULL, para que el INSERT no dependa del estado del schema.
		type: "estandar",
		target_amount: 0,
	}));

	const { error } = await supabase
		.from("categories")
		.upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });

	return error;
}

/**
 * POST /api/save-budget-config
 * Body: {
 *   debt_enabled: boolean,
 *   debt_monthly_cents: number,          // entero >= 0
 *   provisions_enabled: boolean,
 *   provision_items: { label: string, annual_amount_cents: number }[]
 * }
 * Upsert en `budget_config` (1 fila/usuario) + reemplazo total de
 * `provision_items` + siembra de las categorías del sistema.
 */
async function handlePOST(context) {
	// Validación de forma del payload (400 con { error } en español).
	// Booleanos estrictos; montos = enteros de centavos (Patrón Money §2/§4),
	// sin redondear floats ni coaccionar strings.
	let debtEnabled;
	let provisionsEnabled;
	let debtCents;
	let items;
	try {
		const body = await parseJsonBody(context.request);
		debtEnabled = v.boolean(body.debt_enabled, "debt_enabled");
		provisionsEnabled = v.boolean(body.provisions_enabled, "provisions_enabled");
		debtCents = v.intCents(body.debt_monthly_cents, "debt_monthly_cents", {
			min: 0,
		});

		items = v.optionalArray(body.provision_items, "provision_items").map(
			(raw, i) => ({
				label: v.nonEmptyString(raw?.label, `provision_items[${i}].label`, {
					maxLen: 80,
				}),
				annual_amount_cents: v.intCents(
					raw?.annual_amount_cents,
					`provision_items[${i}].annual_amount_cents`,
					{ min: 1 },
				),
			}),
		);
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
	const rl = await checkRateLimit(`${user.id}:save-budget-config`);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

	// Reglas semánticas de negocio (no de forma) -> 422.
	if (debtEnabled && debtCents <= 0) {
		return json({ error: "Habilitaste Deuda: ingresa un pago mensual > 0." }, 422);
	}
	if (provisionsEnabled && items.length === 0) {
		return json(
			{ error: "Habilitaste Provisiones: agrega al menos un rubro." },
			422,
		);
	}

	// 1. Config (1 fila por usuario).
	const { error: upsertError } = await supabase.from("budget_config").upsert(
		{
			user_id: user.id,
			debt_enabled: debtEnabled,
			debt_monthly_cents: debtEnabled ? debtCents : 0,
			provisions_enabled: provisionsEnabled,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "user_id" },
	);
	if (upsertError) return json({ error: upsertError.message }, 500);

	// 2. Rubros: upsert por (user_id, label) para NO perder el id de los rubros
	// que no cambiaron (las transacciones apuntan a él vía provision_item_id).
	// Los que ya no están en la lista se borran por id.
	const { data: existingItems, error: existErr } = await supabase
		.from("provision_items")
		.select("id, label")
		.eq("user_id", user.id);
	if (existErr) return json({ error: existErr.message }, 500);

	const keepLabels = new Set(
		provisionsEnabled ? items.map((it) => it.label) : [],
	);
	const idsToDelete = (existingItems ?? [])
		.filter((row) => !keepLabels.has(row.label))
		.map((row) => row.id);

	if (idsToDelete.length > 0) {
		const { error: delError } = await supabase
			.from("provision_items")
			.delete()
			.in("id", idsToDelete);
		if (delError) return json({ error: delError.message }, 500);
	}

	if (provisionsEnabled && items.length > 0) {
		const { error: upsertItemsError } = await supabase
			.from("provision_items")
			.upsert(
				items.map((it) => ({ ...it, user_id: user.id })),
				{ onConflict: "user_id,label" },
			);
		if (upsertItemsError) {
			return json({ error: upsertItemsError.message }, 500);
		}
	}

	// 3. Categorías del sistema.
	const catError = await ensureSystemCategories(supabase, user.id, {
		debt: debtEnabled,
		provisions: provisionsEnabled,
	});
	if (catError) return json({ error: catError.message }, 500);

	return json({
		ok: true,
		monthly_provision_cents: provisionsEnabled
			? monthlyProvisionCents(items)
			: 0,
		total_fixed_monthly_cents:
			(debtEnabled ? debtCents : 0) +
			(provisionsEnabled ? monthlyProvisionCents(items) : 0),
	});
}

export const POST = withLogging("save-budget-config", handlePOST);
