import { createBrowserClient } from "@supabase/ssr";

let client;

/**
 * Cliente Supabase para el navegador. Persiste la sesión en COOKIES (a través de
 * `@supabase/ssr`), así el servidor la lee luego con `createSupabaseServerClient`.
 * Requiere las variables públicas del entorno.
 */
export function getSupabaseBrowserClient() {
	if (client) return client;

	const url = import.meta.env.PUBLIC_SUPABASE_URL;
	const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

	if (!url || !anonKey) {
		throw new Error(
			"Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en el entorno.",
		);
	}

	client = createBrowserClient(url, anonKey);
	return client;
}
