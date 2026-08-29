import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase-browser.js";

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Formulario de acceso. El modo ("signin" | "signup") es estado de cliente; el
 * envío es un POST NATIVO a la misma página (login.astro lo procesa en el
 * servidor). Los mensajes vienen como props tras el POST.
 *
 * @param {{
 *   error?: string | null,
 *   notice?: string | null,
 *   initialMode?: "signin" | "signup",
 * }} props
 */
export default function AuthForm({
	error = null,
	notice = null,
	initialMode = "signin",
}) {
	const [mode, setMode] = useState(
		initialMode === "signup" ? "signup" : "signin",
	);
	const [googleError, setGoogleError] = useState(null);
	const isSignup = mode === "signup";

	async function handleGoogle() {
		setGoogleError(null);
		try {
			const supabase = getSupabaseBrowserClient();
			const { error } = await supabase.auth.signInWithOAuth({
				provider: "google",
				// Google vuelve a /dashboard?code=... ; el middleware canjea el code
				// por sesión (cookies) antes de dejar pasar la ruta.
				options: {
					redirectTo: `${window.location.origin}/dashboard`,
				},
			});
			if (error) setGoogleError(error.message);
		} catch (err) {
			setGoogleError(err?.message ?? "No se pudo iniciar con Google.");
		}
	}

	return (
		<div className="space-y-4">
			<button
				type="button"
				onClick={handleGoogle}
				className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
					<path
						fill="#4285F4"
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
					></path>
					<path
						fill="#34A853"
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
					></path>
					<path
						fill="#FBBC05"
						d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
					></path>
					<path
						fill="#EA4335"
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
					></path>
				</svg>
				Continuar con Google
			</button>

			{googleError && <p className="text-xs text-rose-400">{googleError}</p>}

			<div className="flex items-center gap-3 text-xs text-slate-500">
				<span className="h-px flex-1 bg-slate-700" />o
				<span className="h-px flex-1 bg-slate-700" />
			</div>

			<form method="post" className="space-y-4">
			{/* El servidor decide signIn vs signUp según este campo. */}
			<input type="hidden" name="mode" value={mode} />

			<label className="block space-y-1">
				<span className="text-xs uppercase tracking-wider text-slate-400">
					Email
				</span>
				<input
					type="email"
					name="email"
					required
					autoComplete="email"
					className={inputClass}
				/>
			</label>

			<label className="block space-y-1">
				<span className="text-xs uppercase tracking-wider text-slate-400">
					Contraseña
				</span>
				<input
					type="password"
					name="password"
					required
					minLength={6}
					autoComplete={isSignup ? "new-password" : "current-password"}
					className={inputClass}
				/>
			</label>

			{error && <p className="text-xs text-rose-400">{error}</p>}
			{notice && <p className="text-xs text-emerald-400">{notice}</p>}

			<button
				type="submit"
				className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
			>
				{isSignup ? "Crear cuenta" : "Iniciar sesión"}
			</button>

			<p className="text-center text-xs text-slate-400">
				{isSignup ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
				<button
					type="button"
					onClick={() => setMode(isSignup ? "signin" : "signup")}
					className="font-medium text-indigo-400 underline-offset-4 hover:underline"
				>
					{isSignup ? "Iniciar sesión" : "Crear cuenta"}
				</button>
			</p>
			</form>
		</div>
	);
}
