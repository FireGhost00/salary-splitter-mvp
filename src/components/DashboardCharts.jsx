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

/** Sin subcategoría elegida (gasto directo contra el sobre maestro). */
const SIN_SUBCATEGORIA = "Sin subcategoría";

/**
 * Gasto del mes por (category_id maestro, subcategory). Solo transaction_type
 * 'gasto' (no ingresos); monto en magnitud positiva (cuánto se gastó, no el
 * saldo neto). Las filas sin subcategory -> "Sin subcategoría", nunca se
 * pierden del total.
 *
 * @param {{ category_id: string | null, amount_cents: number, transaction_type: string, subcategory?: string | null }[]} transactions
 * @returns {Record<string, Record<string, number>>} category_id -> { subLabel: cents }
 */
function sumExpensesBySubcategory(transactions) {
	const totals = {};
	for (const tx of transactions) {
		if (tx.transaction_type !== "gasto") continue;
		const categoryId = tx.category_id;
		if (categoryId == null) continue;
		const cents = Math.abs(Number(tx.amount_cents || 0));
		if (cents === 0) continue;
		const subLabel =
			typeof tx.subcategory === "string" && tx.subcategory.trim() !== ""
				? tx.subcategory.trim()
				: SIN_SUBCATEGORIA;
		const bySub = totals[categoryId] ?? (totals[categoryId] = {});
		bySub[subLabel] = (bySub[subLabel] ?? 0) + cents;
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

	// Desglose de gasto por subcategoría, solo para los sobres 'estandar'
	// (Necesidad/Deseo/Ahorro): son los únicos con subcategorías reales
	// (Deuda/Provisiones no las tienen, ver src/lib/budget.js).
	const expensesBySubcategory = sumExpensesBySubcategory(transactions);
	const subcategoryBreakdown = (
		groups.find((g) => g.key === "estandar")?.rows ?? []
	)
		.map((row) => {
			const bySub = expensesBySubcategory[row.name] ?? {};
			const items = Object.entries(bySub)
				.map(([label, amountCents]) => ({ label, amountCents }))
				.sort((a, b) => b.amountCents - a.amountCents);
			const totalCents = items.reduce((sum, it) => sum + it.amountCents, 0);
			const maxItem = Math.max(1, ...items.map((it) => it.amountCents));
			return { envelope: row.name, items, totalCents, maxItem };
		})
		.filter((e) => e.items.length > 0);

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

			{subcategoryBreakdown.length > 0 && (
				<section className="space-y-4 border-t border-slate-700 pt-4">
					<h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
						Gasto por subcategoría
					</h3>

					{subcategoryBreakdown.map((envelope) => (
						<div key={envelope.envelope} className="space-y-2">
							<div className="flex items-baseline justify-between gap-3 text-sm">
								<span className="text-slate-100">{envelope.envelope}</span>
								<span className="font-mono text-xs tabular-nums text-slate-400">
									{formatCents(envelope.totalCents)}
								</span>
							</div>

							<ul className="space-y-2">
								{envelope.items.map((item) => {
									const pct = Math.round(
										(item.amountCents / envelope.maxItem) * 100,
									);
									return (
										<li key={item.label} className="space-y-1">
											<div className="flex items-baseline justify-between gap-3 text-xs">
												<span className="min-w-0 truncate text-slate-300">
													{item.label}
												</span>
												<span className="shrink-0 font-mono tabular-nums text-slate-300">
													{formatCents(item.amountCents)}
												</span>
											</div>
											<div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
												<div
													className="h-2 rounded-full bg-indigo-500"
													style={{ width: `${pct}%` }}
												/>
											</div>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</section>
			)}
		</div>
	);
}
