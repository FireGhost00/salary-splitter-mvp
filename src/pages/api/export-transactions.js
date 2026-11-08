import { createSupabaseServerClient } from "../../lib/supabase.js";
import { jsonError } from "../../lib/validation.js";
import { withLogging } from "../../lib/logger.js";
import {
	buildTransactionsCsv,
	fetchAllRows,
	parseExportRange,
} from "../../lib/csv-export.js";

// Ruta on-demand: descarga de movimientos en CSV. Protegida por SSR (el
// middleware ya exige sesión en /api/*). Solo lectura: sin rate limiting,
// mismo criterio que get-history.js.
export const prerender = false;

/** Filas por lote. Coincide con el tope por defecto de Supabase (max-rows). */
const BATCH_SIZE = 1000;

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * GET /api/export-transactions?year=YYYY[&month=M]
 *
 * Devuelve un CSV (UTF-8 con BOM) con todos los movimientos del usuario cuya
 * `effective_date` cae en el año o mes pedido, ordenados por effective_date,
 * created_at, id. Se lee en lotes con `.range()` hasta agotar: un año puede
 * superar las 1000 filas que Supabase devuelve por consulta.
 */
async function handleGET(context) {
	const range = parseExportRange({
		yearParam: context.url.searchParams.get("year"),
		monthParam: context.url.searchParams.get("month"),
	});
	if ("error" in range) return jsonError(range.error);

	const supabase = createSupabaseServerClient(context);
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return json({ error: "No autenticado." }, 401);

	// Filtro explícito por user_id ADEMÁS de RLS (igual que get-history.js).
	const { rows, error: txError } = await fetchAllRows(
		(from, to) =>
			supabase
				.from("transactions")
				.select(
					"id, effective_date, created_at, transaction_type, category_id, subcategory, provision_item_id, description, label, amount_cents, group_id",
					{ count: "exact" },
				)
				.eq("user_id", user.id)
				.gte("effective_date", range.from)
				.lte("effective_date", range.to)
				.order("effective_date", { ascending: true })
				.order("created_at", { ascending: true })
				.order("id", { ascending: true })
				.range(from, to),
		{ pageSize: BATCH_SIZE },
	);
	if (txError) return json({ error: txError.message }, 500);

	const { data: provRows, error: provError } = await supabase
		.from("provision_items")
		.select("id, label")
		.eq("user_id", user.id);
	if (provError) return json({ error: provError.message }, 500);

	const provisionLabelsById = new Map(
		(provRows ?? []).map((p) => [String(p.id), p.label]),
	);

	const csv = buildTransactionsCsv(rows, provisionLabelsById);

	return new Response(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${range.filename}"`,
			"Cache-Control": "no-store",
		},
	});
}

export const GET = withLogging("export-transactions", handleGET);
