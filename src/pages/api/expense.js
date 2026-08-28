import { getSupabaseClient } from "../../lib/supabase.js";

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

/**
 * POST /api/expense
 * Body: { amount: number (dólares), category_id: string, label: string }
 * Registra un gasto en `transactions` con el monto en centavos NEGATIVOS,
 * para que un SUM() sobre la columna devuelva el saldo restante.
 */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const { amount, category_id, label } = body ?? {};

	if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
		return json({ error: "`amount` debe ser un número mayor que 0." }, 400);
	}
	if (typeof category_id !== "string" || category_id.trim() === "") {
		return json({ error: "`category_id` es obligatorio." }, 400);
	}
	if (typeof label !== "string" || label.trim() === "") {
		return json({ error: "`label` es obligatorio." }, 400);
	}

	// Patrón Money (CONVENCIONES.md §2): centavos enteros, Math.round explícito.
	// Signo negativo => es un gasto que resta al saldo.
	const amount_cents = Math.round(amount * 100) * -1;

	let supabase;
	try {
		supabase = getSupabaseClient();
	} catch (configError) {
		return json({ error: configError.message }, 500);
	}

	const { data, error } = await supabase
		.from("transactions")
		.insert({
			category_id,
			label: label.trim(),
			amount_cents,
			transaction_type: "gasto",
		})
		.select()
		.single();

	if (error) {
		return json({ error: error.message }, 500);
	}

	return json({ transaction: data }, 200);
}
