/**
 * Rate limiting EN MEMORIA para los endpoints de escritura sensibles
 * (register-income, expense, save-budget-config).
 *
 * LIMITACIÓN (serverless): el estado vive en el scope del módulo, es decir POR
 * instancia de función caliente. Bajo concurrencia Vercel reparte la carga
 * entre varias instancias (un contador independiente en cada una) y el estado
 * se reinicia en cada cold start. Sirve como badén contra un cliente que
 * dispara en bucle contra una misma instancia; NO es una defensa distribuida.
 * Para producción real hace falta un store compartido (Upstash / Vercel KV).
 *
 * `fail-open`: ante cualquier error o entrada rara se DEJA PASAR. Un fallo del
 * limitador nunca debe tumbar tráfico legítimo.
 */

/** Estado: key -> { count, resetAt (epoch ms) }. */
const buckets = new Map();

/** Límite por defecto: 20 escrituras por usuario y endpoint cada 60 s. */
export const DEFAULT_LIMIT = Object.freeze({ max: 20, windowMs: 60_000 });

/** A partir de este tamaño se hace una limpieza de entradas vencidas. */
const CLEANUP_THRESHOLD = 5000;

/**
 * Registra un intento para `key` y dice si se permite.
 *
 * @param {string} key  Identificador estable, p. ej. `${userId}:register-income`.
 * @param {{ max?: number, windowMs?: number, now?: number }} [opts]
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
 */
export function checkRateLimit(key, opts = {}) {
	try {
		const max = opts.max ?? DEFAULT_LIMIT.max;
		const windowMs = opts.windowMs ?? DEFAULT_LIMIT.windowMs;
		const now = opts.now ?? Date.now();

		if (typeof key !== "string" || key === "") {
			return { allowed: true, remaining: max, retryAfterSec: 0 };
		}

		if (buckets.size > CLEANUP_THRESHOLD) {
			for (const [k, entry] of buckets) {
				if (entry.resetAt <= now) buckets.delete(k);
			}
		}

		let entry = buckets.get(key);
		if (!entry || entry.resetAt <= now) {
			entry = { count: 0, resetAt: now + windowMs };
			buckets.set(key, entry);
		}
		entry.count += 1;

		if (entry.count > max) {
			return {
				allowed: false,
				remaining: 0,
				retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
			};
		}
		return { allowed: true, remaining: max - entry.count, retryAfterSec: 0 };
	} catch {
		return { allowed: true, remaining: 0, retryAfterSec: 0 };
	}
}

/** `Response` 429 estándar con `Retry-After`, misma forma `{ error }` que el resto. */
export function rateLimitResponse(retryAfterSec = 1) {
	return new Response(
		JSON.stringify({
			error: "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.",
		}),
		{
			status: 429,
			headers: {
				"Content-Type": "application/json",
				"Retry-After": String(Math.max(1, Math.ceil(retryAfterSec || 1))),
			},
		},
	);
}

/** Solo para pruebas: vacía el estado en memoria. */
export function __resetRateLimitStore() {
	buckets.clear();
}
