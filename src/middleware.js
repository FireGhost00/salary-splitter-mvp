import { createSupabaseServerClient } from "./lib/supabase.js";

// Rutas accesibles sin sesión.
const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/api/auth/"];

/** Prefijos de la app que exigen sesión. El resto (estáticos, etc.) pasa libre. */
const PROTECTED_PREFIXES = [
	"/dashboard",
	"/onboarding",
	"/historial",
	"/configuracion",
	"/perfil",
	"/api/",
];

function isPublic(pathname) {
	if (PUBLIC_PATHS.has(pathname)) return true;
	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtected(pathname) {
	if (pathname === "/") return true;
	return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function onRequest(context, next) {
	const { pathname, searchParams } = context.url;

	// Callback OAuth: Google redirige a <origin>/dashboard?code=... (el redirectTo
	// de signInWithOAuth). Canjeamos el code por sesión aquí y luego limpiamos la
	// URL; así las cookies de sesión quedan seteadas antes de renderizar nada.
	if (
		pathname === "/dashboard" &&
		(searchParams.has("code") || searchParams.has("error"))
	) {
		const code = searchParams.get("code");
		if (code) {
			const supabase = createSupabaseServerClient(context);
			const { error } = await supabase.auth.exchangeCodeForSession(code);
			if (error) {
				return context.redirect(
					`/login?error=${encodeURIComponent(error.message)}`,
				);
			}
			return context.redirect("/dashboard");
		}
		const reason =
			searchParams.get("error_description") ||
			searchParams.get("error") ||
			"No se pudo iniciar sesión con Google.";
		return context.redirect(`/login?error=${encodeURIComponent(reason)}`);
	}

	if (isPublic(pathname) || !isProtected(pathname)) {
		return next();
	}

	const supabase = createSupabaseServerClient(context);
	const {
		data: { session },
	} = await supabase.auth.getSession();

	if (!session) {
		// Para las APIs devolvemos 401 JSON en vez de un redirect a HTML.
		if (pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ error: "No autenticado." }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
		return context.redirect("/login");
	}

	// Disponible para las páginas que lo quieran usar.
	context.locals.user = session.user;

	return next();
}
