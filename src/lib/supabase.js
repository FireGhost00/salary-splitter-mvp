import { createClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";

/**
 * Lee una variable de entorno. En `astro dev` viene de `.env` vía
 * `import.meta.env`; en el server compilado, de `process.env` en runtime.
 */
function readEnv(key) {
	return import.meta.env[key] ?? process.env[key];
}

function getCredentials() {
	const url = readEnv("SUPABASE_URL");
	const anonKey = readEnv("SUPABASE_ANON_KEY");
	if (!url || !anonKey) {
		throw new Error(
			"Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY en el entorno. Copia .env.example a .env.",
		);
	}
	return { url, anonKey };
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
					context.cookies.set(name, value, options);
				}
			},
		},
	});
}
