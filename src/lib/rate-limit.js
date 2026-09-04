/**
 * Rate limiting con Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`),
 * store COMPARTIDO entre instancias — reemplaza el contador en memoria previo
 * (por instancia de función; no protegía nada bajo concurrencia real de
 * Vercel: cada instancia caliente tenía su propio contador y se reiniciaba en
 * cada cold start).
 *
 * Configuración: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
 * (variables de SERVIDOR, sin prefijo `PUBLIC_` — igual que `SUPABASE_URL` /
 * `SUPABASE_ANON_KEY` en src/lib/supabase.js). Si faltan (p. ej. en
 * desarrollo local sin cuenta de Upstash), el rate limiting queda
 * DESACTIVADO: se deja pasar todo y se loguea una advertencia UNA sola vez
 * (nunca se bloquea ni se lanza por falta de config).
 *
 * Ventana deslizante: 20 peticiones por (usuario, endpoint) cada 60 s.
 *
 * FAIL-OPEN: si Upstash responde con error o tarda más de TIMEOUT_MS, se dejan
 * pasar; NUNCA se bloquea el registro de un ingreso o gasto real por una
 * falla del servicio de rate limiting. El error se loguea con logError().
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logError, logWarn } from "./logger.js";

/** 20 peticiones por clave (usuario+endpoint) cada 60 s, ventana deslizante. */
export const DEFAULT_LIMIT = Object.freeze({ max: 20, window: "60 s" });

/** Si Upstash no responde en este tiempo, se trata como caído (fail-open). */
const TIMEOUT_MS = 1500;

// `undefined` = aún no se intentó construir; `null` = Upstash no configurado
// (fail-open silencioso tras el primer aviso); instancia = listo para usar.
let cachedRatelimiter;
let warnedMissingConfig = false;

/** Construye el cliente una sola vez (patrón singleton, igual que supabase.js). */
function buildRatelimiter() {
	const url = import.meta.env.UPSTASH_REDIS_REST_URL;
	const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN;

	if (!url || !token) {
		if (!warnedMissingConfig) {
			warnedMissingConfig = true;
			logWarn({
				endpoint: "rate-limit",
				message:
					"UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN no configuradas: " +
					"el rate limiting queda DESACTIVADO (fail-open). Normal en desarrollo " +
					"local; configúralas en Vercel antes de producción.",
			});
		}
		return null;
	}

	const redis = new Redis({ url, token });
	return new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(DEFAULT_LIMIT.max, DEFAULT_LIMIT.window),
		prefix: "splitter-ratelimit",
		analytics: false,
	});
}

function getRatelimiter() {
	if (cachedRatelimiter === undefined) {
		cachedRatelimiter = buildRatelimiter();
	}
	return cachedRatelimiter;
}

/** Rechaza la promesa si no resuelve en `ms` (Upstash caído/lento -> fail-open). */
function withTimeout(promise, ms) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`Upstash: sin respuesta tras ${ms}ms`)),
			ms,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/**
 * Registra un intento para `key` (p. ej. `${userId}:register-income`) y dice
 * si se permite. Nunca lanza: ante Upstash sin configurar, caído o lento,
 * resuelve `allowed: true` (fail-open) y loguea si corresponde.
 *
 * @param {string} key
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfterSec: number }>}
 */
export async function checkRateLimit(key) {
	if (typeof key !== "string" || key === "") {
		return { allowed: true, remaining: -1, retryAfterSec: 0 };
	}

	const limiter = getRatelimiter();
	if (!limiter) {
		return { allowed: true, remaining: -1, retryAfterSec: 0 };
	}

	try {
		const result = await withTimeout(limiter.limit(key), TIMEOUT_MS);
		if (!result.success) {
			const retryAfterSec = Math.max(
				1,
				Math.ceil((result.reset - Date.now()) / 1000),
			);
			return { allowed: false, remaining: 0, retryAfterSec };
		}
		return { allowed: true, remaining: result.remaining, retryAfterSec: 0 };
	} catch (err) {
		// Upstash caído / timeout: fail-open. La clave trae "<userId>:<endpoint>".
		logError({
			endpoint: "rate-limit",
			method: "internal",
			status: 0,
			userId: key.split(":")[0] || null,
			error: err,
		});
		return { allowed: true, remaining: -1, retryAfterSec: 0 };
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

/** Solo para pruebas: fuerza reconstruir el cliente y el aviso en la próxima llamada. */
export function __resetRateLimiterCache() {
	cachedRatelimiter = undefined;
	warnedMissingConfig = false;
}
