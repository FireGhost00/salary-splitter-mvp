import { useState } from "react";
import { formatCents } from "../lib/money";

const inputClass =
	"w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-right font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// Orden y etiqueta de los grupos (por macro_type).
const GROUPS = [
	{ key: "deuda", label: "Deudas" },
	{ key: "provision", label: "Provisiones" },
	{ key: "Necesidades", label: "Necesidades" },
	{ key: "Deseos", label: "Deseos" },
	{ key: "Ahorro", label: "Ahorro" },
	{ key: "", label: "Sin clasificar" },
];

/**
 * Editor del "Mes Ideal": una meta (target_amount) por categoría, agrupadas por
 * macro_type. Modo Oscuro. Los montos se muestran/editan en la moneda y se
 * envían × 100 (centavos) a /api/update-targets.
 *
 * @param {{ categories?: { id: string, name: string, macro_type?: string, target_amount?: number }[] }} props
 */
export default function IdealMonth({ categories = [] }) {
	const [values, setValues] = useState(() => {
		const o = {};
		for (const c of categories) {
			o[c.id] = c.target_amount ? String(Number(c.target_amount) / 100) : "";
		}
		return o;
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type, text }

	const groups = GROUPS.map((g) => ({
		...g,
		cats: categories.filter((c) => (c.macro_type ?? "") === g.key),
	})).filter((g) => g.cats.length > 0);

	const totalCents = categories.reduce(
		(sum, c) => sum + Math.round((Number(values[c.id]) || 0) * 100),
		0,
	);

	function setValue(id, raw) {
		setFeedback(null);
		setValues((prev) => ({ ...prev, [id]: raw }));
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const items = categories.map((c) => ({
			id: c.id,
			target_amount: Math.round((Number(values[c.id]) || 0) * 100),
		}));

		setIsSubmitting(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/update-targets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ items }),
			});
			const payload = await response.json().catch(() => ({}));

			if (response.ok) {
				setFeedback({ type: "ok", text: "Mes ideal guardado." });
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
			<p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-8 text-center text-sm text-slate-400">
				No tienes categorías todavía.
			</p>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{groups.map((group) => (
				<section key={group.key} className="space-y-2">
					<h2 className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
						{group.label}
					</h2>
					<ul className="divide-y divide-slate-700 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
						{group.cats.map((cat) => (
							<li
								key={cat.id}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<span className="min-w-0 truncate text-sm text-slate-100">
									{cat.name}
								</span>
								<input
									type="number"
									inputMode="decimal"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={values[cat.id] ?? ""}
									onChange={(e) => setValue(cat.id, e.target.value)}
									className={inputClass}
								/>
							</li>
						))}
					</ul>
				</section>
			))}

			<div className="flex items-center justify-between border-t border-slate-700 pt-4 text-sm">
				<span className="text-slate-400">Total mensual objetivo</span>
				<span className="font-mono tabular-nums text-slate-100">
					{formatCents(totalCents)}
				</span>
			</div>

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
				{isSubmitting ? "Guardando…" : "Guardar Mes Ideal"}
			</button>
		</form>
	);
}
