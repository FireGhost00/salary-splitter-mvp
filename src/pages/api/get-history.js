import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: un lote paginado del historial. Protegida por SSR.
export const prerender = false;

/** Movimientos por página. */
export const PAGE_SIZE = 20;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * GET /api/get-history?page=N   (N >= 1, por defecto 1)
 *
 * Devuelve hasta PAGE_SIZE transacciones del usuario, ordenadas por `created_at`
 * descendente, vía `.range(from, to)`. Resuelve el nombre real de la categoría
 * (cruce por UUID si aplica; en esta rama `category_id` ya suele ser el nombre).
 */
export async function GET(context) {
	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	const parsed = Number.parseInt(context.url.searchParams.get("page") ?? "1", 10);
	const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
	const from = (page - 1) * PAGE_SIZE;
	const to = from + PAGE_SIZE - 1;

	const { data: txRows, error: txError } = await supabase
		.from("transactions")
		.select(
			"id, group_id, category_id, description, label, amount_cents, transaction_type, created_at, effective_date",
		)
		.eq("user_id", user.id)
		.order("created_at", { ascending: false })
		.range(from, to);

	if (txError) return json({ error: txError.message }, 500);

	const { data: catRows } = await supabase
		.from("categories")
		.select("id, name")
		.eq("user_id", user.id);

	const nameById = new Map((catRows ?? []).map((c) => [String(c.id), c.name]));

	const transactions = (txRows ?? []).map((tx) => ({
		id: tx.id,
		group_id: tx.group_id ?? null,
		category:
			nameById.get(String(tx.category_id)) ?? tx.category_id ?? "Sin categoría",
		description: tx.description,
		label: tx.label,
		amount_cents: Number(tx.amount_cents ?? 0),
		transaction_type: tx.transaction_type,
		created_at: tx.created_at,
		effective_date: tx.effective_date,
	}));

	return json({ page, page_size: PAGE_SIZE, transactions });
}
