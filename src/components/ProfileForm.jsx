import { useState } from "react";

const inputClass =
	"w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none";

/**
 * Editor del perfil (nombre + salario base). POST a /api/update-profile.
 *
 * @param {{ profile?: { first_name?: string | null, base_salary?: number | string | null } }} props
 */
export default function ProfileForm({ profile = {} }) {
	const [firstName, setFirstName] = useState(profile.first_name ?? "");
	const [baseSalary, setBaseSalary] = useState(
		profile.base_salary != null ? String(profile.base_salary) : "",
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type: "ok" | "error", text }

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const name = firstName.trim();
		const salary = Number.parseFloat(baseSalary);

		if (!name) {
			setFeedback({ type: "error", text: "El nombre es obligatorio." });
			return;
		}
		if (!Number.isFinite(salary) || salary <= 0) {
			setFeedback({ type: "error", text: "Introduce un salario base mayor que 0." });
			return;
		}

		// Multiplicamos por 100 antes de enviar. El endpoint vuelve a dividir entre
		// 100 al persistir, porque `profiles.base_salary` se maneja en DÓLARES en
		// el resto de la app (onboarding, dashboard, /api/split-salary). Efecto
		// neto: el salario queda cuantizado a centavos.
		const baseSalaryCents = Math.round(salary * 100);

		setIsSubmitting(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/update-profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ first_name: name, base_salary: baseSalaryCents }),
			});
			const payload = await response.json().catch(() => ({}));

			if (response.ok) {
				setFeedback({ type: "ok", text: "Perfil actualizado." });
			} else {
				setFeedback({
					type: "error",
					text: payload.error ?? `Error ${response.status}.`,
				});
			}
		} catch {
			setFeedback({
				type: "error",
				text: "No se pudo conectar con el servidor.",
			});
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
		>
			<label className="block space-y-1">
				<span className="text-xs uppercase tracking-wider text-slate-500">
					Nombre
				</span>
				<input
					type="text"
					value={firstName}
					onChange={(event) => setFirstName(event.target.value)}
					required
					autoComplete="given-name"
					className={inputClass}
				/>
			</label>

			<label className="block space-y-1">
				<span className="text-xs uppercase tracking-wider text-slate-500">
					Salario base
				</span>
				<input
					type="number"
					inputMode="decimal"
					step="0.01"
					min="0"
					required
					value={baseSalary}
					onChange={(event) => setBaseSalary(event.target.value)}
					placeholder="0.00"
					className={`${inputClass} font-mono`}
				/>
			</label>

			{feedback && (
				<p
					className={`text-xs ${
						feedback.type === "ok" ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{feedback.text}
				</p>
			)}

			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isSubmitting ? "Guardando…" : "Guardar perfil"}
			</button>
		</form>
	);
}
