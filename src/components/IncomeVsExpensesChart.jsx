import { useMemo } from "react";
import { formatCents } from "../lib/money";

// Lienzo lógico; el SVG escala con viewBox (responsivo).
const W = 640;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

const INGRESO_FILL = "#34d399"; // emerald-400
const SALIDA_FILL = "#fb7185"; // rose-400

/**
 * BarChart Ingresos vs Salidas por mes (YTD). Modo Oscuro, sin librerías: SVG +
 * viewBox para el responsive. Dos barras por mes con esquinas redondeadas.
 *
 * @param {{ data?: { month: string, ingresos: number, salidas: number }[] }} props
 *   Montos en centavos.
 */
export default function IncomeVsExpensesChart({ data = [] }) {
	const geom = useMemo(() => {
		const rows = data.map((d) => ({
			month: d.month,
			ingresos: Math.max(0, Number(d.ingresos) || 0),
			salidas: Math.max(0, Number(d.salidas) || 0),
		}));
		const n = rows.length;
		const maxV = Math.max(
			1,
			...rows.map((r) => Math.max(r.ingresos, r.salidas)),
		);
		const innerW = W - PAD.left - PAD.right;
		const innerH = H - PAD.top - PAD.bottom;
		const baseY = PAD.top + innerH;

		const slotW = n > 0 ? innerW / n : innerW;
		const groupW = slotW * 0.6; // 40 % de aire entre meses
		const barW = Math.max(2, groupW / 2 - 2);
		const h = (v) => (v / maxV) * innerH;

		const bars = rows.map((r, i) => {
			const cx = PAD.left + slotW * (i + 0.5);
			const left = cx - groupW / 2;
			return {
				month: r.month,
				ingreso: {
					x: left,
					y: baseY - h(r.ingresos),
					w: barW,
					h: h(r.ingresos),
				},
				salida: {
					x: left + barW + 4,
					y: baseY - h(r.salidas),
					w: barW,
					h: h(r.salidas),
				},
				labelX: cx,
			};
		});

		return { rows, maxV, baseY, bars };
	}, [data]);

	const hasData = geom.rows.some((r) => r.ingresos > 0 || r.salidas > 0);

	if (data.length === 0 || !hasData) {
		return (
			<div className="rounded-xl border border-slate-700 bg-slate-800 p-6 text-center text-sm text-slate-400">
				Aún no hay movimientos este año.
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-slate-300">
			<div className="mb-2 flex items-center gap-4 text-xs">
				<span className="flex items-center gap-1.5">
					<span
						className="inline-block h-2.5 w-2.5 rounded-sm"
						style={{ backgroundColor: INGRESO_FILL }}
					/>
					Ingresos
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className="inline-block h-2.5 w-2.5 rounded-sm"
						style={{ backgroundColor: SALIDA_FILL }}
					/>
					Salidas
				</span>
			</div>

			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="h-60 w-full"
				role="img"
				aria-label="Ingresos contra salidas por mes"
			>
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

				{geom.bars.map((b) => (
					<g key={b.month}>
						{b.ingreso.h > 0 && (
							<rect
								x={b.ingreso.x}
								y={b.ingreso.y}
								width={b.ingreso.w}
								height={b.ingreso.h}
								rx="2"
								fill={INGRESO_FILL}
							/>
						)}
						{b.salida.h > 0 && (
							<rect
								x={b.salida.x}
								y={b.salida.y}
								width={b.salida.w}
								height={b.salida.h}
								rx="2"
								fill={SALIDA_FILL}
							/>
						)}
						<text
							x={b.labelX}
							y={H - 8}
							textAnchor="middle"
							fontSize="10"
							fill="#64748b"
						>
							{b.month}
						</text>
					</g>
				))}
			</svg>
		</div>
	);
}
