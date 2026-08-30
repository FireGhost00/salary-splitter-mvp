import { createSupabaseServerClient } from "../../lib/supabase.js";
import {
	CORE_CATEGORIES,
	OPTIONAL_CATEGORIES,
	SYS_CAT,
	monthlyProvisionCents,
} from "../../lib/budget.js";

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
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	const debtEnabled = body?.debt_enabled === true;
	const provisionsEnabled = body?.provisions_enabled === true;

	const debtCents = Math.round(Number(body?.debt_monthly_cents) || 0);
	if (!Number.isInteger(debtCents) || debtCents < 0) {
		return json({ error: "`debt_monthly_cents` debe ser un entero >= 0." }, 422);
	}
	if (debtEnabled && debtCents <= 0) {
		return json({ error: "Habilitaste Deuda: ingresa un pago mensual > 0." }, 422);
	}

	// Normaliza rubros. Solo se guardan si Provisiones está activo.
	const rawItems = Array.isArray(body?.provision_items) ? body.provision_items : [];
	const items = [];
	for (const raw of rawItems) {
		const label = String(raw?.label ?? "").trim();
		const cents = Math.round(Number(raw?.annual_amount_cents) || 0);
		if (!label) continue;
		if (!Number.isInteger(cents) || cents <= 0) {
			return json(
				{ error: `El rubro "${label}" necesita un monto anual > 0.` },
				422,
			);
		}
		items.push({ label, annual_amount_cents: cents });
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
