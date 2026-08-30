import { useMemo, useState } from "react";
import { formatCents } from "../lib/money";
import { MASTER_SPLIT, splitIncome } from "../lib/budget";

/**
 * Simulador de presupuesto ("Mes Ideal"). El usuario escribe un ingreso mensual
 * esperado y ve el reparto 50/30/20 en vivo. La Deuda y la Provisión Mensual
 * (que se configuran en /configuracion, no aquí) se absorben dentro del 50 % de
 * Necesidad; si lo superan, se muestra la misma alerta roja que el IncomeModal.
 *
 * @param {{
 *   debtMonthlyCents?: number,
 *   provisionMonthlyCents?: number,
 *   fixedMonthlyCents?: number,
 *   initialIncomeCents?: number,
 * }} props
 */
export default function IdealMonth({
	debtMonthlyCents = 0,
	provisionMonthlyCents = 0,
	fixedMonthlyCents = 0,
	initialIncomeCents = 0,
}) {
	const [incomeText, setIncomeText] = useState(
		initialIncomeCents > 0 ? String(initialIncomeCents / 100) : "",
	);
	const [isSaving, setIsSaving] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type: "ok" | "error", text }

	async function handleSave() {
		if (isSaving) return;
		const parsed = Number.parseFloat(incomeText);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setFeedback({ type: "error", text: "Introduce un ingreso mayor que 0." });
			return;
		}

		setIsSaving(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/update-profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					ideal_monthly_income_cents: Math.round(parsed * 100),
				}),
			});
			const payload = await response.json().catch(() => ({}));
			setFeedback(
				response.ok
					? { type: "ok", text: "Mes ideal guardado." }
					: {
							type: "error",
							text: payload.error ?? `Error ${response.status}.`,
						},
			);
		} catch {
			setFeedback({ type: "error", text: "No se pudo conectar con el servidor." });
		} finally {
			setIsSaving(false);
		}
	}

	const sim = useMemo(() => {
		const parsed = Number.parseFloat(incomeText);
		const incomeCents =
			Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
		const split = splitIncome(incomeCents, {
			debtCents: debtMonthlyCents,
			provisionCents: provisionMonthlyCents,
		});
		return { incomeCents, ...split };
	}, [incomeText, debtMonthlyCents, provisionMonthlyCents]);

	const showDeficit = sim.incomeCents > 0 && sim.deficit;
	const limiteNecesidad = sim.shares.necesidad;

	return (
		<div className="space-y-6">
			{/* Ingreso mensual esperado */}
			<label className="block space-y-2">
				<span className="text-xs uppercase tracking-wider text-slate-400">
					Ingreso mensual esperado
				</span>
				<div className="relative">
					<span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-slate-500">
						$
					</span>
					<input
						type="number"
						inputMode="decimal"
						step="0.01"
						min="0"
						placeholder="0.00"
						value={incomeText}
						onChange={(e) => {
							setFeedback(null);
							setIncomeText(e.target.value);
						}}
						className="w-full rounded-xl border border-slate-700 bg-slate-900 py-4 pl-10 pr-4 text-right font-mono text-3xl text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
					/>
				</div>
			</label>

			<p className="text-xs text-slate-500">
				Carga fija mensual (deuda + provisiones):{" "}
				<span className="font-mono text-slate-300">
					{formatCents(fixedMonthlyCents)}
				</span>
				{" · "}
				<a className="underline hover:text-slate-300" href="/configuracion">
					ajústala en Configuración
				</a>
			</p>

			{/* PASO 3: alerta de déficit (misma lógica/estilo que IncomeModal) */}
			{showDeficit && (
				<div className="rounded-lg border border-rose-500 bg-rose-950/40 p-4">
					<div className="flex gap-3 text-rose-400">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.75"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="mt-0.5 h-5 w-5 shrink-0"
							aria-hidden="true"
						>
							<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
						<div className="space-y-1 text-xs">
							<p>
								⚠️ Atención: Tus deudas y provisiones superan tu 50% para
								necesidades. Tendrás que ajustar tus gastos de Deseo o Ahorro para
								cubrir el déficit de este mes.
							</p>
							<p className="text-rose-400/80">
								Deuda {formatCents(sim.fixed_target.debt_cents)} + Provisión{" "}
								{formatCents(sim.fixed_target.provision_cents)} ={" "}
								{formatCents(sim.fixed_target.total_cents)} &gt; 50 % ={" "}
								{formatCents(limiteNecesidad)}. Déficit:{" "}
								{formatCents(sim.over_cents)}.
							</p>
						</div>
					</div>
				</div>
			)}

			{/* PASO 2: tarjeta de desglose 50/30/20 */}
			<div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-5">
				<p className="text-xs uppercase tracking-wider text-slate-400">
					Desglose del ingreso
				</p>

				<BreakdownRow
					label="Necesidad"
					pct={MASTER_SPLIT.necesidad}
					cents={sim.shares.necesidad}
				/>
				<BreakdownRow
					label="Deseo"
					pct={MASTER_SPLIT.deseo}
					cents={sim.shares.deseo}
				/>
				<BreakdownRow
					label="Ahorro"
					pct={MASTER_SPLIT.ahorro}
					cents={sim.shares.ahorro}
				/>

				<div className="space-y-1 border-t border-slate-700 pt-3 text-xs text-slate-400">
					<SubRow label="Deuda" cents={sim.fixed_target.debt_cents} />
					<SubRow
						label="Provisión mensual"
						cents={sim.fixed_target.provision_cents}
					/>
					<SubRow
						label="Necesidad libre"
						cents={sim.necesidad_free_cents}
						strong
					/>
				</div>
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
				type="button"
				onClick={handleSave}
				disabled={isSaving}
				className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isSaving ? "Guardando…" : "Guardar Mes Ideal"}
			</button>

			<p className="text-center text-xs text-slate-500">
				El progreso contra esta meta se muestra en el Dashboard.
			</p>
		</div>
	);
}

function BreakdownRow({ label, pct, cents }) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="flex items-center gap-2 text-slate-100">
				{label}
				<span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
					{pct}%
				</span>
			</span>
			<span className="font-mono tabular-nums text-slate-100">
				{formatCents(cents)}
			</span>
		</div>
	);
}

function SubRow({ label, cents, strong = false }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span>— {label}</span>
			<span
				className={`font-mono tabular-nums ${
					strong ? "text-slate-200" : "text-slate-400"
				}`}
			>
				{formatCents(cents)}
			</span>
		</div>
	);
}
