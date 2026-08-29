import { createSupabaseServerClient } from "../../../lib/supabase.js";

// Ruta on-demand: lista los ingresos reservados para meses futuros del usuario.
export const prerender = false;

/** Respuesta JSON con el status indicado. */
function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Último día del mes actual como YYYY-MM-DD (hora local). */
function lastDayOfCurrentMonthISO() {
	const now = new Date();
	const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const pad2 = (n) => String(n).padStart(2, "0");
	return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`;
}

/**
 * GET /api/transaction/deferred
 * Ingresos (amount_cents > 0) con effective_date POSTERIOR al último día del mes
 * actual: los mismos que alimentan `saldoDiferido` en el dashboard. Filtrados por
 * el usuario de la sesión (SSR) + RLS.
 */
export async function GET(context) {
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

	const { data, error } = await supabase
		.from("transactions")
		.select("id, description, label, amount_cents, effective_date")
		.eq("user_id", user.id)
		.gt("amount_cents", 0)
		.gt("effective_date", lastDayOfCurrentMonthISO())
		.order("effective_date", { ascending: true });

	if (error) {
		return json({ error: error.message }, 500);
	}

	return json({ transactions: data ?? [] }, 200);
}
