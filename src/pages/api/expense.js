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

/**
 * POST /api/expense
 * Body: { amount: number (dólares), category_id: string, label?: string, description?: string }
 * `label` es opcional; por defecto "Gasto". `description` es opcional; null si viene vacío.
 * Registra un gasto en `transactions` con el monto en centavos NEGATIVOS,
 * para que un SUM() sobre la columna devuelva el saldo restante.
 */
export async function POST(context) {
	const { request } = context;
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const { amount, category_id, label, description } = body ?? {};

	if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
		return json({ error: "`amount` debe ser un número mayor que 0." }, 400);
	}
	if (typeof category_id !== "string" || category_id.trim() === "") {
		return json({ error: "`category_id` es obligatorio." }, 400);
	}

	// `label` es opcional: si no viene o llega vacío, usa "Gasto" por defecto.
	const finalLabel =
		typeof label === "string" && label.trim() !== "" ? label.trim() : "Gasto";

	// `description` es opcional: null si viene vacío/ausente.
	const finalDescription =
		typeof description === "string" && description.trim() !== ""
			? description.trim()
			: null;

	// Patrón Money (CONVENCIONES.md §2): centavos enteros, Math.round explícito.
	// Signo negativo => es un gasto que resta al saldo.
	const amount_cents = Math.round(amount * 100) * -1;

	let supabase;
	try {
		supabase = createSupabaseServerClient(context);
	} catch (configError) {
		return json({ error: configError.message }, 500);
	}

	// Requiere sesión: el insert respeta RLS y `user_id` sale de auth.uid().
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return json({ error: "No autenticado." }, 401);
	}

	const { data, error } = await supabase
		.from("transactions")
		.insert({
			category_id,
			label: finalLabel,
			description: finalDescription,
			amount_cents,
			transaction_type: "gasto",
			// US-15: los gastos siempre se registran con la fecha de hoy.
			effective_date: localDateISO(),
		})
		.select()
		.single();

	if (error) {
		return json({ error: error.message }, 500);
	}

	return json({ transaction: data }, 200);
}
