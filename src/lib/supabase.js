import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para uso en el servidor (endpoints de API).
 * Las credenciales viven en `.env` (ver CONVENCIONES.md §4) y nunca se exponen
 * al cliente porque este módulo solo se importa desde rutas on-demand.
 *
 * Se crea de forma perezosa para que la validación de entrada de un endpoint
 * pueda responder aunque falten las variables de entorno.
 */
let client;

export function getSupabaseClient() {
	if (client) return client;

	const supabaseUrl = import.meta.env.SUPABASE_URL;
	const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error(
			"Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY en el entorno. Copia .env.example a .env.",
		);
	}

	client = createClient(supabaseUrl, supabaseAnonKey);
	return client;
}
