import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase-browser.js";

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60";

/** Mensaje de éxito / error bajo cada formulario. */
function Feedback({ feedback }) {
	if (!feedback) return null;
	return (
		<p
			className={`text-xs ${
				feedback.type === "ok" ? "text-emerald-400" : "text-rose-400"
			}`}
			role="status"
		>
			{feedback.text}
		</p>
	);
}

/**
 * Gestión de la cuenta del usuario (isla React).
 *
 * - **Nombre para mostrar**: `supabase.auth.updateUser({ data: { display_name } })`
 *   (metadatos de Auth) y, en paralelo, se refleja en `profiles.first_name` vía
 *   `/api/update-profile` para que el saludo del dashboard quede sincronizado.
 * - **Contraseña**: `supabase.auth.updateUser({ password })`. Solo se muestra si
 *   el usuario tiene identidad de correo (los de Google no la usan).
 * - **Cerrar sesión**: POST nativo a `/api/auth/signout` (borra las cookies en
 *   el servidor y redirige a /login).
 *
 * @param {{
 *   email?: string,
 *   displayName?: string,
 *   canChangePassword?: boolean,
 * }} props
 */
export default function AccountForm({
	email = "",
	displayName = "",
	canChangePassword = false,
}) {
	// --- Nombre para mostrar ------------------------------------------------
	const [name, setName] = useState(displayName ?? "");
	const [savedName, setSavedName] = useState(displayName ?? "");
	const [nameLoading, setNameLoading] = useState(false);
	const [nameFeedback, setNameFeedback] = useState(null);

	// --- Contraseña ------------------------------------------------------
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [pwLoading, setPwLoading] = useState(false);
	const [pwFeedback, setPwFeedback] = useState(null);

	const nameDirty = name.trim() !== savedName.trim();

	async function handleNameSubmit(event) {
		event.preventDefault();
		if (nameLoading) return;

		const value = name.trim();
		if (!value) {
			setNameFeedback({ type: "error", text: "El nombre no puede ir vacío." });
			return;
		}
		if (value.length > 60) {
			setNameFeedback({ type: "error", text: "Máximo 60 caracteres." });
			return;
		}

		setNameLoading(true);
		setNameFeedback(null);
		try {
			const supabase = getSupabaseBrowserClient();
			// 1. Metadatos de Auth (fuente que pide la tarea).
			const { error } = await supabase.auth.updateUser({
				data: { display_name: value },
			});
			if (error) {
				setNameFeedback({ type: "error", text: error.message });
				return;
			}

			// 2. Reflejo en `profiles.first_name` (lo usa el saludo del dashboard).
			// Si falla, el nombre de Auth ya quedó guardado: avisamos suave.
			let mirrored = true;
			try {
				const res = await fetch("/api/update-profile", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ first_name: value }),
				});
				mirrored = res.ok;
			} catch {
				mirrored = false;
			}

			setSavedName(value);
			setNameFeedback({
				type: "ok",
				text: mirrored
					? "Nombre actualizado."
					: "Nombre guardado en tu cuenta (el saludo puede tardar en reflejarlo).",
			});
		} catch (err) {
			setNameFeedback({
				type: "error",
				text: err?.message ?? "No se pudo conectar con el servidor.",
			});
		} finally {
			setNameLoading(false);
		}
	}

	async function handlePasswordSubmit(event) {
		event.preventDefault();
		if (pwLoading) return;

		if (password.length < 6) {
			setPwFeedback({
				type: "error",
				text: "La contraseña debe tener al menos 6 caracteres.",
			});
			return;
		}
		if (password !== confirm) {
			setPwFeedback({ type: "error", text: "Las contraseñas no coinciden." });
			return;
		}

		setPwLoading(true);
		setPwFeedback(null);
		try {
			const supabase = getSupabaseBrowserClient();
			const { error } = await supabase.auth.updateUser({ password });
			if (error) {
				setPwFeedback({ type: "error", text: error.message });
				return;
			}
			setPassword("");
			setConfirm("");
			setPwFeedback({ type: "ok", text: "Contraseña actualizada." });
		} catch (err) {
			setPwFeedback({
				type: "error",
				text: err?.message ?? "No se pudo conectar con el servidor.",
			});
		} finally {
			setPwLoading(false);
		}
	}

	return (
		<div className="space-y-4">
			{/* -------- Nombre para mostrar -------- */}
			<form
				onSubmit={handleNameSubmit}
				className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5"
			>
				<div className="space-y-1">
					<h2 className="text-sm font-semibold text-slate-100">Cuenta</h2>
					<p className="text-xs text-slate-400">{email}</p>
				</div>

				<label className="block space-y-1">
					<span className="text-xs uppercase tracking-wider text-slate-400">
						Nombre para mostrar
					</span>
					<input
						type="text"
						value={name}
						onChange={(event) => setName(event.target.value)}
						maxLength={60}
						autoComplete="nickname"
						disabled={nameLoading}
						className={inputClass}
					/>
				</label>

				<Feedback feedback={nameFeedback} />

				<button
					type="submit"
					disabled={nameLoading || !nameDirty}
					className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{nameLoading ? "Guardando…" : "Guardar nombre"}
				</button>
			</form>

			{/* -------- Contraseña -------- */}
			<div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
				<h2 className="mb-4 text-sm font-semibold text-slate-100">Contraseña</h2>

				{canChangePassword ? (
					<form onSubmit={handlePasswordSubmit} className="space-y-4">
						<label className="block space-y-1">
							<span className="text-xs uppercase tracking-wider text-slate-400">
								Nueva contraseña
							</span>
							<input
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								minLength={6}
								autoComplete="new-password"
								disabled={pwLoading}
								className={inputClass}
							/>
						</label>

						<label className="block space-y-1">
							<span className="text-xs uppercase tracking-wider text-slate-400">
								Repetir contraseña
							</span>
							<input
								type="password"
								value={confirm}
								onChange={(event) => setConfirm(event.target.value)}
								minLength={6}
								autoComplete="new-password"
								disabled={pwLoading}
								className={inputClass}
							/>
						</label>

						<Feedback feedback={pwFeedback} />

						<button
							type="submit"
							disabled={pwLoading || !password || !confirm}
							className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{pwLoading ? "Guardando…" : "Cambiar contraseña"}
						</button>
					</form>
				) : (
					<p className="text-xs text-slate-400">
						Iniciaste sesión con Google, así que tu acceso no usa contraseña.
					</p>
				)}
			</div>

			{/* -------- Cerrar sesión -------- */}
			<form
				method="POST"
				action="/api/auth/signout"
				className="rounded-xl border border-slate-700 bg-slate-800 p-5"
			>
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-0.5">
						<h2 className="text-sm font-semibold text-slate-100">Sesión</h2>
						<p className="text-xs text-slate-400">
							Cierra la sesión en este dispositivo.
						</p>
					</div>
					<button
						type="submit"
						className="shrink-0 rounded-lg border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
					>
						Cerrar sesión
					</button>
				</div>
			</form>
		</div>
	);
}
