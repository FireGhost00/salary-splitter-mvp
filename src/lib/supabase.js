import { createClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";

// Credenciales SIEMPRE desde import.meta.env (CONVENCIONES.md §4). Nunca hardcodear.
const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY;

function getCredentials() {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
		throw new Error(
			"Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY en el entorno. Copia .env.example a .env.",
		);
	}
	return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

/**
 * Cliente sin sesión (anon). Para trabajos de servidor que no dependen del
 * usuario autenticado. Se crea de forma perezosa.
 */
let anonClient;
export function getSupabaseClient() {
	if (anonClient) return anonClient;
	const { url, anonKey } = getCredentials();
	anonClient = createClient(url, anonKey);
	return anonClient;
}

/**
 * Cliente ligado a la petición actual: lee/escribe las cookies de Supabase Auth
 * para resolver la sesión del usuario y respetar RLS. Debe crearse una vez por
 * request (CONVENCIONES.md §1: Supabase Auth).
 *
 * @param {import("astro").AstroGlobal | import("astro").APIContext} context
 */
export function createSupabaseServerClient(context) {
	const { url, anonKey } = getCredentials();

	return createServerClient(url, anonKey, {
		cookies: {
			getAll() {
				return parseCookieHeader(context.request.headers.get("Cookie") ?? "");
			},
			setAll(cookiesToSet) {
				for (const { name, value, options } of cookiesToSet) {
					// `@supabase/ssr` no marca `Secure`; se fuerza aquí. En prod
					// (HTTPS) no cambia nada; en dev el navegador igual acepta
					// cookies `Secure` sobre http://localhost (contexto seguro).
					// `HttpOnly` y `SameSite` se dejan como los define la librería:
					// el cliente de navegador y el flujo PKCE de Google los
					// necesitan tal cual (cookie legible por JS, SameSite=Lax).
					context.cookies.set(name, value, { ...options, secure: true });
				}
			},
		},
	});
}
