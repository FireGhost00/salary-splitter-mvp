import { formatCents } from "../lib/money";

/**
 * Tarjetas de resumen anual (Modo Oscuro). Todos los montos llegan en centavos;
 * se dividen entre 100 vía formatCents. El Balance Neto va en verde si es
 * positivo y en rojo si es negativo.
 *
 * @param {{
 *   year?: number,
 *   ingresosTotales?: number,
 *   totalDeudasPagadas?: number,
 *   totalProvisionado?: number,
 *   totalGastos?: number,
 *   balanceNeto?: number,
 * }} props
 */
export default function AnnualSummary({
	year,
	ingresosTotales = 0,
	totalDeudasPagadas = 0,
	totalProvisionado = 0,
	totalGastos = 0,
	balanceNeto = 0,
}) {
	const netPositive = Number(balanceNeto) >= 0;

	const metrics = [
		{
			label: "Ingresos totales",
			value: ingresosTotales,
			color: "text-emerald-400",
		},
		{ label: "Deudas pagadas", value: totalDeudasPagadas, color: "text-rose-400" },
		{ label: "Provisionado", value: totalProvisionado, color: "text-blue-400" },
		{ label: "Gastos", value: totalGastos, color: "text-rose-400" },
	];

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<div className="rounded-xl border border-slate-700 bg-slate-800 p-5 sm:col-span-2">
				<p className="text-xs uppercase tracking-wider text-slate-400">
					Balance neto{year ? ` ${year}` : ""}
				</p>
				<p
					className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${
						netPositive ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{formatCents(Number(balanceNeto))}
				</p>
				<p className="mt-1 text-xs text-slate-400">
					Ingresos − deudas − provisiones − gastos
				</p>
			</div>

			{metrics.map((m) => (
				<div
					key={m.label}
					className="rounded-xl border border-slate-700 bg-slate-800 p-5"
				>
					<p className="text-xs uppercase tracking-wider text-slate-400">
						{m.label}
					</p>
					<p
						className={`mt-1 font-mono text-xl font-semibold tabular-nums ${m.color}`}
					>
						{formatCents(Number(m.value))}
					</p>
				</div>
			))}
		</div>
	);
}
