import { formatCents } from "../lib/money";

// Colores por macro tipo: Azul / Morado / Verde (literales, para el JIT de Tailwind).
const GROUPS = [
	{ key: "necesidades", label: "Necesidades", color: "bg-blue-500" },
	{ key: "deseos", label: "Deseos", color: "bg-purple-500" },
	{ key: "ahorro", label: "Ahorro", color: "bg-emerald-500" },
];

/**
 * Panel analítico del dashboard: barra de progreso horizontal + tres tarjetas
 * con el monto acumulado por macro tipo. Solo HTML + Tailwind (sin librerías).
 * Recibe los totales en centavos (CONVENCIONES.md §2); la división entre 100
 * ocurre aquí, vía formatCents.
 *
 * @param {{
 *   totalNecesidades?: number,
 *   totalDeseos?: number,
 *   totalAhorro?: number,
 *   ingresoMensual?: number,
 * }} props
 */
export default function DashboardCharts({
	totalNecesidades = 0,
	totalDeseos = 0,
	totalAhorro = 0,
	ingresoMensual = 0,
}) {
	const income = Number(ingresoMensual) || 0;

	// Porcentaje gastado sobre el ingreso del mes. Sin ingreso -> 0 (nunca NaN).
	const toPct = (cents) =>
		income > 0 ? Math.round((Number(cents || 0) / income) * 100) : 0;

	const amountByKey = {
		necesidades: Number(totalNecesidades) || 0,
		deseos: Number(totalDeseos) || 0,
		ahorro: Number(totalAhorro) || 0,
	};

	const rows = GROUPS.map((group) => ({
		...group,
		amountCents: amountByKey[group.key],
		pct: toPct(amountByKey[group.key]),
	}));

	return (
		<div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
			{income <= 0 && (
				<p className="mb-3 text-xs text-slate-400">
					Sin ingresos registrados este mes.
				</p>
			)}

			{/* Barra de progreso horizontal: anchos dinámicos por porcentaje */}
			<div className="flex h-6 w-full overflow-hidden rounded-full bg-slate-700">
				{rows.map((row) => (
					<div
						key={row.key}
						className={row.color}
						style={{ width: `${row.pct}%` }}
						title={`${row.label}: ${row.pct}%`}
					/>
				))}
			</div>

			{/* Tres tarjetas: monto acumulado por macro tipo */}
			<div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
				{rows.map((row) => (
					<div
						key={row.key}
						className="rounded-lg border border-slate-700 bg-slate-900 p-3"
					>
						<div className="flex items-center gap-2">
							<span
								className={`inline-block h-2 w-2 rounded-full ${row.color}`}
							/>
							<span className="text-xs font-medium text-slate-300">
								{row.label}
							</span>
						</div>
						<p
							className={`mt-1 font-mono text-base tabular-nums ${
								row.key === "ahorro" ? "text-emerald-400" : "text-rose-400"
							}`}
						>
							{formatCents(row.amountCents)}
						</p>
						<p className="text-xs text-slate-400">{row.pct}% del ingreso</p>
					</div>
				))}
			</div>
		</div>
	);
}
