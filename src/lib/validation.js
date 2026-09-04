/**
 * Validación de payloads para los endpoints SSR (`src/pages/api/*`).
 *
 * Único punto para tres cosas:
 *  1. Forma del body (tipos, campos obligatorios/opcionales).
 *  2. Patrón Money (CONVENCIONES.md §2 y §4): los montos SIEMPRE son enteros de
 *     centavos. No se coacciona: un float, un string numérico o un valor fuera
 *     del rango de una columna `int4` son error 400, nunca se "arreglan".
 *  3. Mensajes en español que el frontend muestra tal cual al usuario.
 *
 * Convención de estados: estas guardas producen 400 (payload malformado). Las
 * reglas semánticas de negocio ("habilitaste Deuda pero el monto es 0",
 * "categoría reservada", "el rubro no existe") las resuelve cada endpoint y
 * usan 422 / 409 / 404 según corresponda.
 *
 *   import { ValidationError, parseJsonBody, v, jsonError } from "../../lib/validation.js";
 *
 *   let amountCents;
 *   try {
 *     const body = await parseJsonBody(context.request);
 *     amountCents = v.intCents(body.amount_cents, "amount_cents", { min: 1 });
 *   } catch (e) {
 *     if (e instanceof ValidationError) return jsonError(e.message);
 *     throw e;
 *   }
 */

/**
 * Techo de una columna `int4` de PostgreSQL. Un centavo por encima haría
 * fallar el INSERT en la base; se corta antes con 400.
 */
export const INT4_MAX = 2147483647;

/** Error de forma del payload. Cada endpoint lo traduce a `400 { error }`. */
export class ValidationError extends Error {
	constructor(message) {
		super(message);
		this.name = "ValidationError";
	}
}

/** `Response` JSON con `{ error }` y el status indicado (400 por defecto). */
export function jsonError(message, status = 400) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Lee y parsea el body JSON. Lanza `ValidationError` si no es JSON válido. */
export async function parseJsonBody(request) {
	try {
		return await request.json();
	} catch {
		throw new ValidationError("Cuerpo JSON inválido.");
	}
}

function fail(message) {
	throw new ValidationError(message);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const v = {
	/**
	 * Entero de centavos (Patrón Money). `number` entero exacto: se rechazan
	 * float, string (incl. "5000"), NaN, Infinity, `< min` y `> INT4_MAX`.
	 * @param {number} min  Mínimo permitido (1 por defecto).
	 */
	intCents(value, field, { min = 1 } = {}) {
		if (typeof value !== "number" || !Number.isInteger(value)) {
			fail(`\`${field}\` debe ser un entero de centavos (sin decimales).`);
		}
		if (value < min) {
			fail(`\`${field}\` debe ser un entero de centavos mayor o igual que ${min}.`);
		}
		if (value > INT4_MAX) {
			fail(`\`${field}\` supera el máximo permitido.`);
		}
		return value;
	},

	/**
	 * Igual que `intCents` pero admite ausencia (`undefined` / `null`), en cuyo
	 * caso devuelve `opts.default ?? null`.
	 */
	optionalIntCents(value, field, opts = {}) {
		if (value === undefined || value === null) return opts.default ?? null;
		return v.intCents(value, field, opts);
	},

	/** String no vacío tras `trim()`. Devuelve el valor recortado. */
	nonEmptyString(value, field, { maxLen } = {}) {
		if (typeof value !== "string" || value.trim() === "") {
			fail(`\`${field}\` es obligatorio.`);
		}
		const trimmed = value.trim();
		if (maxLen != null && trimmed.length > maxLen) {
			fail(`\`${field}\` no puede superar ${maxLen} caracteres.`);
		}
		return trimmed;
	},

	/** String opcional: `undefined` / `null` / `""` -> `null`; si viene, recortado. */
	optionalString(value, field, { maxLen } = {}) {
		if (value === undefined || value === null) return null;
		if (typeof value !== "string") fail(`\`${field}\` debe ser texto.`);
		const trimmed = value.trim();
		if (trimmed === "") return null;
		if (maxLen != null && trimmed.length > maxLen) {
			fail(`\`${field}\` no puede superar ${maxLen} caracteres.`);
		}
		return trimmed;
	},

	/** Booleano estricto (`true` / `false`); cualquier otra cosa es 400. */
	boolean(value, field) {
		if (typeof value !== "boolean") {
			fail(`\`${field}\` debe ser true o false.`);
		}
		return value;
	},

	/** Uno de `allowed` (comparación estricta). */
	enum(value, field, allowed) {
		if (!allowed.includes(value)) {
			fail(`\`${field}\` debe ser uno de: ${allowed.join(", ")}.`);
		}
		return value;
	},

	/**
	 * Fecha ISO `YYYY-MM-DD` de calendario válido (rechaza `2026-13-01`).
	 * Opcional: `undefined` / `null` -> `null`.
	 */
	optionalIsoDate(value, field) {
		if (value === undefined || value === null) return null;
		if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
			fail(`\`${field}\` debe tener formato YYYY-MM-DD.`);
		}
		const [y, m, d] = value.split("-").map(Number);
		const dt = new Date(Date.UTC(y, m - 1, d));
		if (
			dt.getUTCFullYear() !== y ||
			dt.getUTCMonth() !== m - 1 ||
			dt.getUTCDate() !== d
		) {
			fail(`\`${field}\` no es una fecha válida.`);
		}
		return value;
	},

	/**
	 * UUID en formato canónico (8-4-4-4-12). Opcional: `undefined` / `null` ->
	 * `null`. Un well-formed UUID que no exista en la base NO lo detecta esto:
	 * eso lo comprueba el endpoint contra Supabase (422).
	 */
	optionalUuid(value, field) {
		if (value === undefined || value === null) return null;
		if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
			fail(`\`${field}\` inválido.`);
		}
		return value.trim();
	},

	/** Array. Ausente -> `[]`. No-array -> 400. */
	optionalArray(value, field) {
		if (value === undefined || value === null) return [];
		if (!Array.isArray(value)) fail(`\`${field}\` debe ser una lista.`);
		return value;
	},
};
