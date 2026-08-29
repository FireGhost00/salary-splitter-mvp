import { useMemo, useState } from "react";

const inputClass =
	"w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-sm text-slate-100 focus:border-slate-500 focus:outline-none";

/**
 * Editor de reglas de distribución. Un input de porcentaje por categoría; la
 * suma se calcula en tiempo real y el botón "Guardar Reglas" solo se habilita
 * cuando el total es exactamente 100%.
 *
 * @param {{
 *   categories?: { id: string, name: string }[],
 *   rules?: { category_id: string, percentage: number }[],
 * }} props
 */
export default function RulesEditor({ categories = [], rules = [] }) {
	const [values, setValues] = useState(() => {
		const initial = {};
		for (const cat of categories) {
			const existing = rules.find((r) => r.category_id === cat.id);
			initial[cat.id] = existing ? String(existing.percentage) : "0";
		}
		return initial;
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type: "ok" | "error", text }

	const total = useMemo(
		() =>
			Object.values(values).reduce((sum, v) => sum + (Number(v) || 0), 0),
		[values],
	);
	const isValid = total === 100;

	function setValue(id, raw) {
		setValues((prev) => ({ ...prev, [id]: raw }));
		setFeedback(null);
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting || !isValid) return;

		const payloadRules = categories
			.map((cat) => ({
				category_id: cat.id,
				percentage: Number(values[cat.id]) || 0,
			}))
			.filter((r) => r.percentage > 0);

		setIsSubmitting(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/update-rules", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ rules: payloadRules }),
			});
			const payload = await response.json().catch(() => ({}));

			if (response.ok) {
				setFeedback({ type: "ok", text: "Reglas guardadas." });
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

	if (categories.length === 0) {
		return (
			<p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-8 text-center text-sm text-slate-500">
				No tienes categorías todavía.
			</p>
		);
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
		>
			<ul className="divide-y divide-slate-800">
				{categories.map((cat) => (
					<li
						key={cat.id}
						className="flex items-center justify-between gap-4 py-2.5"
					>
						<span className="min-w-0 truncate text-sm text-slate-100">
							{cat.name}
						</span>
						<div className="flex shrink-0 items-center gap-1">
							<input
								type="number"
								inputMode="numeric"
								min="0"
								max="100"
								value={values[cat.id] ?? "0"}
								onChange={(event) => setValue(cat.id, event.target.value)}
								className={inputClass}
							/>
							<span className="text-xs text-slate-500">%</span>
						</div>
					</li>
				))}
			</ul>

			<div className="flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
				<span className="text-slate-400">Total</span>
				<span
					className={`font-mono font-semibold ${
						isValid ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{total}%
				</span>
			</div>

			{!isValid && (
				<p className="text-xs text-rose-400">
					Los porcentajes deben sumar exactamente 100% (van {total}%).
				</p>
			)}

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
				disabled={!isValid || isSubmitting}
				className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isSubmitting ? "Guardando…" : "Guardar Reglas"}
			</button>
		</form>
	);
}
