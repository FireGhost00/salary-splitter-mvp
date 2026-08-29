import { useMemo, useState } from "react";

const pctInputClass =
	"w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const smallInputClass =
	"rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const MACRO_OPTIONS = [
	{ value: "", label: "Sin clasificar" },
	{ value: "Necesidades", label: "Necesidades" },
	{ value: "Deseos", label: "Deseos" },
	{ value: "Ahorro", label: "Ahorro" },
	{ value: "provision", label: "Provisión" },
	{ value: "deuda", label: "Deuda" },
];

/** Sugerencia por defecto (en dólares) al marcar una provisión sin monto. */
const PROVISION_SUGGESTION = "100";

/**
 * Editor de categorías + reglas. Por cada categoría: macro_type (incluye
 * 'deuda' y 'provision' para la cascada del ingreso), target_amount (solo si
 * deuda/provisión) y el porcentaje del reparto del remanente.
 * Guarda en /api/update-categories (macro + target) y /api/update-rules (%).
 *
 * @param {{
 *   categories?: { id: string, name: string, macro_type?: string, target_amount?: number }[],
 *   rules?: { category_id: string, percentage: number }[],
 * }} props
 */
export default function RulesEditor({ categories = [], rules = [] }) {
	const [pct, setPct] = useState(() => {
		const o = {};
		for (const c of categories) {
			const r = rules.find((x) => x.category_id === c.id);
			o[c.id] = r ? String(r.percentage) : "0";
		}
		return o;
	});
	const [macro, setMacro] = useState(() => {
		const o = {};
		for (const c of categories) o[c.id] = c.macro_type ?? "";
		return o;
	});
	// target_amount en DÓLARES (string); se pasa a centavos al guardar.
	const [target, setTarget] = useState(() => {
		const o = {};
		for (const c of categories) {
			o[c.id] = c.target_amount ? String(c.target_amount / 100) : "";
		}
		return o;
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type, text }

	const total = useMemo(
		() => Object.values(pct).reduce((s, v) => s + (Number(v) || 0), 0),
		[pct],
	);
	// Válido si suma 100, o si están todos en 0 (cascada pura, sin %).
	const pctValid = total === 100 || total === 0;

	function onMacroChange(id, value) {
		setFeedback(null);
		setMacro((prev) => ({ ...prev, [id]: value }));
		if (value === "provision" && !target[id]) {
			setTarget((prev) => ({ ...prev, [id]: PROVISION_SUGGESTION }));
		}
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting || !pctValid) return;

		for (const c of categories) {
			const m = macro[c.id];
			if ((m === "deuda" || m === "provision") && !(Number(target[c.id]) > 0)) {
				setFeedback({
					type: "error",
					text: `"${c.name}" (${m}) necesita un monto mayor que 0.`,
				});
				return;
			}
		}

		const catItems = categories.map((c) => ({
			name: c.id,
			macro_type: macro[c.id] ?? "",
			target_amount:
				macro[c.id] === "deuda" || macro[c.id] === "provision"
					? Math.round((Number(target[c.id]) || 0) * 100)
					: 0,
		}));
		const ruleItems = categories
			.map((c) => ({ category_id: c.id, percentage: Number(pct[c.id]) || 0 }))
			.filter((r) => r.percentage > 0);

		setIsSubmitting(true);
		setFeedback(null);
		try {
			const requests = [
				fetch("/api/update-categories", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ items: catItems }),
				}),
			];
			if (ruleItems.length > 0) {
				requests.push(
					fetch("/api/update-rules", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ rules: ruleItems }),
					}),
				);
			}

			const responses = await Promise.all(requests);
			const bad = responses.find((r) => !r.ok);

			if (!bad) {
				setFeedback({ type: "ok", text: "Configuración guardada." });
			} else {
				const payload = await bad.json().catch(() => ({}));
				setFeedback({
					type: "error",
					text: payload.error ?? `Error ${bad.status}.`,
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
		<form
			onSubmit={handleSubmit}
			className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5"
		>
			<ul className="divide-y divide-slate-700">
				{categories.map((cat) => {
					const m = macro[cat.id];
					const needsTarget = m === "deuda" || m === "provision";
					return (
						<li key={cat.id} className="space-y-2 py-3">
							<div className="flex items-center justify-between gap-3">
								<span className="min-w-0 truncate text-sm text-slate-100">
									{cat.name}
								</span>
								<div className="flex shrink-0 items-center gap-1">
									<input
										type="number"
										inputMode="numeric"
										min="0"
										max="100"
										value={pct[cat.id] ?? "0"}
										onChange={(e) => {
											setFeedback(null);
											setPct((prev) => ({ ...prev, [cat.id]: e.target.value }));
										}}
										className={pctInputClass}
									/>
									<span className="text-xs text-slate-500">%</span>
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<select
									value={m ?? ""}
									onChange={(e) => onMacroChange(cat.id, e.target.value)}
									className={`${smallInputClass} w-40`}
								>
									{MACRO_OPTIONS.map((o) => (
										<option key={o.value} value={o.value}>
											{o.label}
										</option>
									))}
								</select>

								{needsTarget && (
									<label className="flex items-center gap-2 text-xs text-slate-400">
										{m === "deuda" ? "Monto adeudado" : "Provisión / mes"}
										<input
											type="number"
											inputMode="decimal"
											step="0.01"
											min="0"
											required
											value={target[cat.id] ?? ""}
											onChange={(e) => {
												setFeedback(null);
												setTarget((prev) => ({
													...prev,
													[cat.id]: e.target.value,
												}));
											}}
											placeholder={
												m === "provision" ? PROVISION_SUGGESTION : "0.00"
											}
											className={`${smallInputClass} w-28 font-mono`}
										/>
									</label>
								)}
							</div>
						</li>
					);
				})}
			</ul>

			<div className="flex items-center justify-between border-t border-slate-700 pt-3 text-sm">
				<span className="text-slate-400">Total %</span>
				<span
					className={`font-mono font-semibold ${
						pctValid ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{total}%
				</span>
			</div>

			{!pctValid && (
				<p className="text-xs text-rose-400">
					Los porcentajes deben sumar 100% (o dejarlos todos en 0 si solo usas la
					cascada). Van {total}%.
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
				disabled={!pctValid || isSubmitting}
				className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isSubmitting ? "Guardando…" : "Guardar configuración"}
			</button>
		</form>
	);
}
