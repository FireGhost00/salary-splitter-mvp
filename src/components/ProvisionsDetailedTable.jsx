import { formatCents } from "../lib/money";

/**
 * Tabla detallada por rubro de provisión (Modo Oscuro), estilo hoja de Excel.
 *
 * @param {{ data?: {
 *   label: string,
 *   annualCents: number,
 *   monthlyCents: number,
 *   savedCents: number,      // ahorro provisionado (ingresos)
 *   usedCents: number,       // cantidad usada (|gastos|)
 *   remainingCents: number,  // por usar = saved - used
 * }[] }} props
 */
export default function ProvisionsDetailedTable({ data = [] }) {
	if (data.length === 0) {
		return (
			<div className="rounded-xl border border-slate-700 bg-slate-800 p-6 text-center text-sm text-slate-400">
				No hay rubros de provisión configurados.
			</div>
		);
	}

	const th = "px-3 py-2 text-right font-medium";
	const td = "px-3 py-2.5 text-right font-mono tabular-nums";

	return (
		<div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
						<th className="px-3 py-2 text-left font-medium">Provisión</th>
						<th className={th}>Meta anual</th>
						<th className={th}>Contribución mensual</th>
						<th className={th}>Ahorro provisionado</th>
						<th className={th}>Cantidad usada</th>
						<th className={th}>Por usar</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-700">
					{data.map((row) => {
						// Las provisiones son alcancías: el saldo "Por usar" nunca baja de 0
						// (el efecto derrame absorbe el excedente en las maestras).
						const saldoVisible = Math.max(
							0,
							row.savedCents - row.usedCents,
						);
						const enCero = saldoVisible <= 0;
						return (
							<tr key={row.label}>
								<td className="px-3 py-2.5 text-left text-slate-100">
									{row.label}
								</td>
								<td className={`${td} text-slate-300`}>
									{formatCents(row.annualCents)}
								</td>
								<td className={`${td} text-slate-300`}>
									{formatCents(row.monthlyCents)}
								</td>
								<td className={`${td} text-emerald-400`}>
									{formatCents(row.savedCents)}
								</td>
								<td className={`${td} text-slate-300`}>
									{formatCents(row.usedCents)}
								</td>
								<td
									className={`${td} ${enCero ? "text-slate-500" : "text-slate-100"}`}
								>
									{formatCents(saldoVisible)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
