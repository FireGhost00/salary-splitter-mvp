import { useMemo } from "react";
import { formatCents } from "../lib/money";

// Lienzo lógico; el SVG escala con viewBox (responsivo).
const W = 640;
const H = 220;
const PAD = { top: 16, right: 20, bottom: 28, left: 56 };

/**
 * AreaChart del crecimiento acumulado de las Provisiones (sinking funds) a lo
 * largo del año. Modo Oscuro, área en emerald-400 con gradiente translúcido.
 * Sin librerías: SVG + viewBox para el responsive.
 *
 * @param {{ data?: { month: string, balanceCents: number }[] }} props
 *   12 puntos (uno por mes) con el SALDO ACUMULADO al cierre de ese mes.
 */
export default function ProvisionsGrowthChart({ data = [] }) {
	const geom = useMemo(() => {
		const points = data.map((d, i) => ({
			month: d.month,
			value: Math.max(0, Number(d.balanceCents) || 0),
			i,
		}));
		const n = points.length;
		const maxV = Math.max(1, ...points.map((p) => p.value));
		const innerW = W - PAD.left - PAD.right;
		const innerH = H - PAD.top - PAD.bottom;
		const baseY = PAD.top + innerH;

		const x = (i) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
		const y = (v) => PAD.top + innerH - (v / maxV) * innerH;

		const line = points
			.map(
				(p, i) =>
					`${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`,
			)
			.join(" ");
		const area =
			n > 0
				? `${line} L ${x(n - 1).toFixed(1)} ${baseY} L ${x(0).toFixed(1)} ${baseY} Z`
				: "";

		return { points, maxV, baseY, x, y, line, area };
	}, [data]);

	// Hay algo que dibujar si cualquier mes tiene saldo acumulado != 0.
	const hasData = data.some((d) => Number(d.balanceCents) !== 0);

	if (data.length === 0 || !hasData) {
		return (
			<div className="rounded-xl border border-slate-700 bg-slate-800 p-6 text-center text-sm text-slate-400">
				Aún no hay aportes a provisiones este año.
			</div>
		);
	}

	const peak = geom.points[geom.points.length - 1].value;

	return (
		<div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-slate-300">
			<div className="mb-2 flex items-baseline justify-between">
				<span className="text-xs uppercase tracking-wider text-slate-400">
					Saldo acumulado
				</span>
				<span className="font-mono text-sm font-semibold text-emerald-400">
					{formatCents(peak)}
				</span>
			</div>

			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="h-56 w-full"
				role="img"
				aria-label="Crecimiento acumulado de provisiones por mes"
			>
				<defs>
					<linearGradient id="provGrowthFill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
						<stop offset="100%" stopColor="#34d399" stopOpacity="0" />
					</linearGradient>
				</defs>

				{/* Guías + ejes mínimos */}
				<line
					x1={PAD.left}
					y1={PAD.top}
					x2={W - PAD.right}
					y2={PAD.top}
					stroke="#1e293b"
					strokeWidth="1"
				/>
				<line
					x1={PAD.left}
					y1={geom.baseY}
					x2={W - PAD.right}
					y2={geom.baseY}
					stroke="#334155"
					strokeWidth="1"
				/>
				<text
					x={PAD.left - 8}
					y={PAD.top + 4}
					textAnchor="end"
					fontSize="11"
					fill="#64748b"
				>
					{formatCents(geom.maxV)}
				</text>
				<text
					x={PAD.left - 8}
					y={geom.baseY + 4}
					textAnchor="end"
					fontSize="11"
					fill="#64748b"
				>
					$0
				</text>

				{/* Área + línea */}
				<path d={geom.area} fill="url(#provGrowthFill)" />
				<path
					d={geom.line}
					fill="none"
					stroke="#34d399"
					strokeWidth="2"
					strokeLinejoin="round"
					strokeLinecap="round"
				/>

				{/* Puntos + etiquetas de mes */}
				{geom.points.map((p, i) => (
					<g key={p.month}>
						<circle
							cx={geom.x(i)}
							cy={geom.y(p.value)}
							r="2.5"
							fill="#34d399"
						/>
						<text
							x={geom.x(i)}
							y={H - 8}
							textAnchor="middle"
							fontSize="10"
							fill="#64748b"
						>
							{p.month}
						</text>
					</g>
				))}
			</svg>
		</div>
	);
}
