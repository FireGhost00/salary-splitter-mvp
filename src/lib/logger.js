/**
 * Logging estructurado para las funciones serverless de `src/pages/api/`.
 *
 * Cada línea es un único objeto JSON impreso a stderr (`console.error`), que
 * Vercel captura tal cual en los "Function Logs" de cada despliegue (ver
 * docs/INFRAESTRUCTURA.md). Forma: `{ level, endpoint, method, status,
 * user_id, error, timestamp }`.
 *
 * QUÉ NUNCA SE LOGUEA: cookies, cabecera `Authorization`, `SUPABASE_ANON_KEY`,
 * `SUPABASE_URL`, el `service_role key` (que además este proyecto no usa en
 * ningún lado — solo la `anon key`, ver docs/INFRAESTRUCTURA.md), ni el
 * cuerpo crudo de la petición (montos, etc.): `logError` solo acepta texto
 * corto (nombre de endpoint, método, user_id, mensaje de error), nunca un
 * objeto de body. Como defensa adicional, `redact()` sustituye cualquier
 * cadena con forma de JWT o de cookie de sesión de Supabase por
 * "[redacted]" antes de imprimir, por si un mensaje de error las arrastrara.
 */

const JWT_OR_COOKIE_RE =
	/(eyJ[\w-]+\.[\w-]+\.[\w-]+)|(sb-[a-z0-9-]+-auth-token[^\s"',;]*=[^\s"',;]+)/gi;

/** Sustituye JWT / cookies de sesión de Supabase por un marcador. */
export function redact(value) {
	if (typeof value !== "string") return value;
	return value.replace(JWT_OR_COOKIE_RE, "[redacted]");
}

/**
 * Imprime una línea de log de error estructurada.
 *
 * @param {{
 *   endpoint: string,
 *   method: string,
 *   status: number,
 *   userId?: string | null,
 *   error: unknown,
 * }} fields
 */
export function logError({ endpoint, method, status, userId = null, error }) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: String(error?.message ?? error ?? "error desconocido");

	const entry = {
		level: "error",
		endpoint,
		method,
		status,
		user_id: userId ?? null,
		error: redact(message).slice(0, 500),
		timestamp: new Date().toISOString(),
	};

	console.error(JSON.stringify(entry));
}

/**
 * Imprime una línea de log de ADVERTENCIA estructurada: degradación esperada
 * (p. ej. falta configuración opcional), no el fallo de una petición concreta.
 *
 * @param {{ endpoint: string, message: string }} fields
 */
export function logWarn({ endpoint, message }) {
	const entry = {
		level: "warn",
		endpoint,
		message: redact(String(message ?? "")).slice(0, 500),
		timestamp: new Date().toISOString(),
	};

	console.warn(JSON.stringify(entry));
}

/**
 * Envuelve el handler exportado de un endpoint (`POST` / `GET` / `DELETE`)
 * para, de forma consistente en los 7 endpoints de `src/pages/api/`:
 *
 *  1. Capturar cualquier excepción NO controlada (p. ej.
 *     `createSupabaseServerClient` lanzando por falta de credenciales) y
 *     devolver un 500 `{ error }` uniforme en vez del error genérico de
 *     Astro/Vercel — y loguearla.
 *  2. Loguear cualquier respuesta que el handler ya devuelva con
 *     status >= 500 por su cuenta (errores de Supabase, etc.).
 *
 * Las respuestas 2xx/4xx (incluido 401/422/429) pasan intactas: NO cambia
 * ningún contrato de éxito ni de error ya existente. Solo se loguean los
 * >= 500 porque son los que representan un fallo a investigar; un 400/401/
 * 404/422/429 es una respuesta esperada del propio endpoint.
 *
 * @param {string} endpointName  p. ej. "register-income".
 * @param {(context: import("astro").APIContext) => Promise<Response>} handler
 */
export function withLogging(endpointName, handler) {
	return async function wrapped(context) {
		let userId = null;
		try {
			// El middleware ya autenticó la request y dejó la sesión en locals.
			userId = context?.locals?.user?.id ?? null;
		} catch {
			// best-effort: el logging nunca debe romper la petición.
		}

		try {
			const response = await handler(context);

			if (response instanceof Response && response.status >= 500) {
				let message = `HTTP ${response.status}`;
				try {
					const payload = await response.clone().json();
					if (payload?.error) message = payload.error;
				} catch {
					// cuerpo no-JSON o vacío: se registra solo el status.
				}
				logError({
					endpoint: endpointName,
					method: context.request.method,
					status: response.status,
					userId,
					error: message,
				});
			}

			return response;
		} catch (err) {
			logError({
				endpoint: endpointName,
				method: context.request.method,
				status: 500,
				userId,
				error: err,
			});
			return new Response(
				JSON.stringify({ error: "Error interno del servidor." }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	};
}
