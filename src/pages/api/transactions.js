import { createSupabaseServerClient } from "../../lib/supabase.js";

// Ruta on-demand: inserta en Supabase leyendo la sesión de las cookies.
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/transactions
 * Body: {
 *   amount: number (en la moneda),
 *   transaction_type: "gasto" | "ingreso",
 *   category_id: string (nombre de la categoría),
 *   effective_date?: string (YYYY-MM-DD; hoy por defecto),
 *   description?: string,
 * }
 * Inserta una fila en `transactions` para el usuario de la sesión.
 */
export async function POST(context) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return json({ error: "Cuerpo JSON inválido." }, 400);
	}

	const { amount, transaction_type, category_id, effective_date, description } =
		body ?? {};

	if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
		return json({ error: "`amount` debe ser un número mayor que 0." }, 400);
	}
	if (transaction_type !== "gasto" && transaction_type !== "ingreso") {
		return json(
			{ error: "`transaction_type` debe ser 'gasto' o 'ingreso'." },
			400,
		);
	}
	if (typeof category_id !== "string" || category_id.trim() === "") {
		return json({ error: "`category_id` es obligatorio." }, 400);
	}
	if (effective_date != null && !DATE_RE.test(String(effective_date))) {
		return json(
			{ error: "`effective_date` debe tener formato YYYY-MM-DD." },
			400,
		);
	}

	let supabase;
	try {
		supabase = createSupabaseServerClient(context);
	} catch (configError) {
		return json({ error: configError.message }, 500);
	}

	// user_id autenticado desde las cookies de sesión.
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return json({ error: "No autenticado." }, 401);
	}

	// Patrón Money (CONVENCIONES.md §2): centavos enteros. Gasto negativo,
	// ingreso positivo, para que un SUM() dé el saldo.
	const magnitude = Math.abs(Math.round(amount * 100));
	const amount_cents = transaction_type === "gasto" ? -magnitude : magnitude;

	const finalDescription =
		typeof description === "string" && description.trim() !== ""
			? description.trim()
			: null;

	const { data, error } = await supabase
		.from("transactions")
		.insert({
			user_id: user.id,
			category_id: category_id.trim(),
			label:
				finalDescription ??
				(transaction_type === "ingreso" ? "Ingreso" : "Gasto"),
			description: finalDescription,
			amount_cents,
			transaction_type,
			effective_date: effective_date ?? localDateISO(),
		})
		.select()
		.single();

	if (error) {
		return json({ error: error.message }, 500);
	}

	return json({ transaction: data }, 201);
}
