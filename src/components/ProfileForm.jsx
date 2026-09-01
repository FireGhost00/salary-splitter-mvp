import { useState } from "react";

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * Editor del salario base de referencia. POST parcial a /api/update-profile.
 * (El nombre para mostrar se gestiona en AccountForm, vía Supabase Auth.)
 *
 * @param {{ profile?: { base_salary?: number | string | null } }} props
 */
export default function ProfileForm({ profile = {} }) {
	const [baseSalary, setBaseSalary] = useState(
		profile.base_salary != null ? String(profile.base_salary) : "",
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type: "ok" | "error", text }

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const salary = Number.parseFloat(baseSalary);
		if (!Number.isFinite(salary) || salary <= 0) {
			setFeedback({ type: "error", text: "Introduce un salario base mayor que 0." });
			return;
		}

		// Multiplicamos por 100 antes de enviar. El endpoint vuelve a dividir entre
		// 100 al persistir, porque `profiles.base_salary` se maneja en DÓLARES en
		// el resto de la app. Efecto neto: el salario queda cuantizado a centavos.
		const baseSalaryCents = Math.round(salary * 100);

		setIsSubmitting(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/update-profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ base_salary: baseSalaryCents }),
			});
			const payload = await response.json().catch(() => ({}));

			if (response.ok) {
				setFeedback({ type: "ok", text: "Salario actualizado." });
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
			className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5"
		>
			<label className="block space-y-1">
				<span className="text-xs uppercase tracking-wider text-slate-400">
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
				className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isSubmitting ? "Guardando…" : "Guardar salario"}
			</button>
		</form>
	);
}
