import { createSupabaseServerClient } from "../../../lib/supabase.js";

// Ruta on-demand: borra las cookies de sesión de Supabase Auth.
export const prerender = false;

export async function POST(context) {
	const supabase = createSupabaseServerClient(context);
	await supabase.auth.signOut();
	return context.redirect("/login");
}
