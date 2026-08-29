import { formatCents } from "../lib/money";

// Grupos por macro_type. Todo lo que no es 'deuda' ni 'provision' -> 'estandar'.
const GROUPS = [
	{ key: "deuda", label: "Deudas", color: "bg-rose-500" },
	{ key: "provision", label: "Provisiones", color: "bg-blue-500" },
	{ key: "estandar", label: "Estándar", color: "bg-emerald-500" },
];

function groupKeyOf(macroType) {
	if (macroType === "deuda") return "deuda";
	if (macroType === "provision") return "provision";
	return "estandar";
}

/** Suma amount_cents de las transacciones del mes agrupando por category_id. */
function sumByCategory(transactions) {
	const totals = {};
	for (const tx of transactions) {
		const key = tx.category_id;
		if (key == null) continue;
		totals[key] = (totals[key] ?? 0) + Number(tx.amount_cents || 0);
	}
	return totals;
}

/**
 * Panel de categorías dinámicas: barras horizontales de progreso, Modo Oscuro,
 * agrupadas por macro_type (Deudas -> Provisiones -> Estándar). Sin gráficas
 * circulares, sin modelo 50/30/20.
 *
 * @param {{
 *   categories?: { name: string, macro_type?: string, target_amount?: number }[],
 *   transactions?: { category_id: string | null, amount_cents: number }[],
 * }} props
 */
export default function DashboardCharts({ categories = [], transactions = [] }) {
	const totals = sumByCategory(transactions);

	const groups = GROUPS.map((g) => {
		const rows = categories
			.filter((c) => groupKeyOf(c.macro_type) === g.key)
			.map((c) => ({
				name: c.name,
				amountCents: totals[c.name] ?? 0,
				targetCents: Number(c.target_amount ?? 0),
			}));
		// Para 'estandar' las barras son comparativas (respecto a la mayor del grupo).
		const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.amountCents)));
		return { ...g, rows, maxAbs };
	}).filter((g) => g.rows.length > 0);

	if (groups.length === 0) {
		return (
			<div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center text-sm text-slate-400">
				Sin categorías. Créalas en Configuración.
			</div>
		);
	}

	return (
		<div className="space-y-5 rounded-xl border border-slate-700 bg-slate-800 p-4">
			{groups.map((g) => (
				<section key={g.key} className="space-y-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
						{g.label}
					</h3>

					<ul className="space-y-3">
						{g.rows.map((row) => {
							const hasTarget =
								(g.key === "deuda" || g.key === "provision") &&
								row.targetCents > 0;
							const filled = Math.max(0, row.amountCents);
							const pct = hasTarget
								? Math.min(100, Math.round((filled / row.targetCents) * 100))
								: Math.round((Math.abs(row.amountCents) / g.maxAbs) * 100);

							return (
								<li key={row.name} className="space-y-1">
									<div className="flex items-baseline justify-between gap-3 text-sm">
										<span className="min-w-0 truncate text-slate-100">
											{row.name}
										</span>
										<span className="shrink-0 font-mono text-xs tabular-nums text-slate-100">
											{formatCents(row.amountCents)}
											{hasTarget && (
												<span className="text-slate-400">
													{" / "}
													{formatCents(row.targetCents)}
												</span>
											)}
										</span>
									</div>

									<div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
										<div
											className={`h-3 rounded-full ${g.color}`}
											style={{ width: `${pct}%` }}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
