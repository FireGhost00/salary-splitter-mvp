import { formatCents } from "../lib/money";

/**
 * Termómetro de deudas: una tarjeta por deuda con el avance de pago.
 * Presentacional; los montos llegan ya calculados en centavos (§2).
 *
 * @param {{ debts?: Array<{
 *   name: string,
 *   paidCents: number,
 *   targetCents: number,
 *   percent: number,
 * }> }} props
 */
export default function DebtTracker({ debts = [] }) {
	if (debts.length === 0) return null;

	return (
		<section className="space-y-3">
			<h2 className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
				Deudas
			</h2>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{debts.map((debt) => {
					const percent = Math.max(0, Math.min(100, Number(debt.percent) || 0));
					const done = percent >= 100;
					return (
						<div
							key={debt.name}
							className="rounded-xl border border-slate-700 bg-slate-800 p-4"
						>
							<div className="mb-2 flex items-baseline justify-between gap-3">
								<span className="min-w-0 truncate text-sm font-medium text-slate-100">
									{debt.name}
								</span>
								<span
									className={`shrink-0 font-mono text-xs tabular-nums ${
										done ? "text-emerald-400" : "text-slate-400"
									}`}
								>
									{percent}%
								</span>
							</div>

							<p className="mb-2 font-mono text-sm tabular-nums text-slate-100">
								{formatCents(debt.paidCents)}
								<span className="text-slate-400">
									{" / "}
									{formatCents(debt.targetCents)}
								</span>
							</p>

							<div className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
								<div
									className={`h-3 rounded-full ${
										done ? "bg-emerald-400" : "bg-emerald-500"
									}`}
									style={{ width: `${percent}%` }}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
