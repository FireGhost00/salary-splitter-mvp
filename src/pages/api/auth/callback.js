import { createSupabaseServerClient } from "../../../lib/supabase.js";

// Ruta on-demand: cierra el flujo OAuth (PKCE) y setea las cookies de sesión.
export const prerender = false;

export async function GET(context) {
	const url = new URL(context.request.url);
	const code = url.searchParams.get("code");
	// `next` permite volver a la página desde donde se pidió el login.
	const next = url.searchParams.get("next") ?? "/dashboard";

	if (!code) {
		return context.redirect("/login?error=Falta%20el%20par%C3%A1metro%20code");
	}

	const supabase = createSupabaseServerClient(context);

	// Canjea el code por una sesión. Internamente lee el code_verifier de las
	// cookies (getAll) y persiste los tokens de sesión (setAll -> context.cookies).
	const { error } = await supabase.auth.exchangeCodeForSession(code);

	if (error) {
		return context.redirect(`/login?error=${encodeURIComponent(error.message)}`);
	}

	return context.redirect(next);
}
