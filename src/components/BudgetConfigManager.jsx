import { useMemo, useState } from "react";
import { formatCents } from "../lib/money";

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

let seq = 0;
const newId = () => `p-${Date.now().toString(36)}-${seq++}`;

/** dólares (string legible) -> centavos enteros (CONVENCIONES.md §2). */
const toCents = (text) => Math.round((Number(text) || 0) * 100);

/** Toggle estilo iOS. */
function Switch({ checked, onChange, label }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			onClick={() => onChange(!checked)}
			className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
				checked ? "bg-indigo-600" : "bg-slate-600"
			}`}
		>
			<span
				className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
					checked ? "translate-x-5" : "translate-x-1"
				}`}
			/>
		</button>
	);
}

/**
 * Gestión de Deuda y Provisiones del presupuesto 50/30/20.
 *
 * El monto de la deuda y los rubros se muestran en dinero legible (dólares) y
 * se envían en centavos enteros. Provisión Mensual = Σ montos anuales / 12.
 * Guarda en POST /api/save-budget-config.
 *
 * @param {{
 *   config?: { debt_enabled?: boolean, debt_monthly_cents?: number, provisions_enabled?: boolean },
 *   provisionItems?: { label: string, annual_amount_cents: number }[],
 * }} props
 */
export default function BudgetConfigManager({ config = {}, provisionItems = [] }) {
	const [debtEnabled, setDebtEnabled] = useState(config.debt_enabled === true);
	const [debtAmount, setDebtAmount] = useState(
		config.debt_monthly_cents ? String(config.debt_monthly_cents / 100) : "",
	);

	const [provisionsEnabled, setProvisionsEnabled] = useState(
		config.provisions_enabled === true,
	);
	const [provisions, setProvisions] = useState(() =>
		provisionItems.length > 0
			? provisionItems.map((it) => ({
					id: newId(),
					label: it.label ?? "",
					annual_amount: it.annual_amount_cents
						? String(it.annual_amount_cents / 100)
						: "",
				}))
			: [{ id: newId(), label: "", annual_amount: "" }],
	);

	const [isSaving, setIsSaving] = useState(false);
	const [feedback, setFeedback] = useState(null); // { type: "ok" | "error", text }

	// --- Cálculo reactivo del resumen ---------------------------------
	const provisionMensualCents = useMemo(() => {
		if (!provisionsEnabled) return 0;
		const annual = provisions.reduce((s, p) => s + toCents(p.annual_amount), 0);
		return Math.round(annual / 12);
	}, [provisions, provisionsEnabled]);

	const debtCents = debtEnabled ? toCents(debtAmount) : 0;
	const totalFijoCents = debtCents + provisionMensualCents;

	function updateProvision(id, patch) {
		setFeedback(null);
		setProvisions((prev) =>
			prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
		);
	}
	function addProvision() {
		setProvisions((prev) => [
			...prev,
			{ id: newId(), label: "", annual_amount: "" },
		]);
	}
	function removeProvision(id) {
		setProvisions((prev) =>
			prev.length > 1 ? prev.filter((p) => p.id !== id) : prev,
		);
	}

	async function handleSave() {
		if (isSaving) return;

		if (debtEnabled && !(Number(debtAmount) > 0)) {
			setFeedback({ type: "error", text: "Ingresa un pago de deuda mayor que 0." });
			return;
		}

		const cleanItems = provisions
			.filter((p) => p.label.trim() && Number(p.annual_amount) > 0)
			.map((p) => ({
				label: p.label.trim(),
				annual_amount_cents: toCents(p.annual_amount),
			}));

		if (provisionsEnabled && cleanItems.length === 0) {
			setFeedback({
				type: "error",
				text: "Agrega al menos una provisión con monto anual.",
			});
			return;
		}

		setIsSaving(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/save-budget-config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					debt_enabled: debtEnabled,
					debt_monthly_cents: debtEnabled ? toCents(debtAmount) : 0,
					provisions_enabled: provisionsEnabled,
					provision_items: provisionsEnabled ? cleanItems : [],
				}),
			});

			const payload = await response.json().catch(() => ({}));
			if (response.ok) {
				setFeedback({ type: "ok", text: "Configuración guardada." });
			} else {
				setFeedback({
					type: "error",
					text: payload.error ?? `Error ${response.status}.`,
				});
			}
		} catch {
			setFeedback({ type: "error", text: "No se pudo conectar con el servidor." });
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="space-y-6 text-slate-100">
			{/* Deuda */}
			<section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h3 className="text-sm font-semibold">Deuda</h3>
						<p className="text-xs text-slate-400">Pago mensual fijo.</p>
					</div>
					<Switch
						checked={debtEnabled}
						onChange={(v) => {
							setFeedback(null);
							setDebtEnabled(v);
						}}
						label="Habilitar deuda"
					/>
				</div>

				{debtEnabled && (
					<label className="mt-4 block space-y-1">
						<span className="text-xs uppercase tracking-wider text-slate-400">
							Pago mensual
						</span>
						<input
							type="number"
							inputMode="decimal"
							step="0.01"
							min="0"
							placeholder="0.00"
							value={debtAmount}
							onChange={(e) => {
								setFeedback(null);
								setDebtAmount(e.target.value);
							}}
							className={`${inputClass} font-mono`}
						/>
					</label>
				)}
			</section>

			{/* Provisiones */}
			<section className="rounded-xl border border-slate-700 bg-slate-800 p-5">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h3 className="text-sm font-semibold">Provisiones</h3>
						<p className="text-xs text-slate-400">
							Rubros anuales que se prorratean al mes.
						</p>
					</div>
					<Switch
						checked={provisionsEnabled}
						onChange={(v) => {
							setFeedback(null);
							setProvisionsEnabled(v);
						}}
						label="Habilitar provisiones"
					/>
				</div>

				{provisionsEnabled && (
					<div className="mt-4 space-y-2">
						<div className="grid grid-cols-[1fr_8rem_2rem] gap-2 text-xs uppercase tracking-wider text-slate-500">
							<span>Nombre</span>
							<span className="text-right">Monto anual</span>
							<span />
						</div>

						{provisions.map((p) => (
							<div
								key={p.id}
								className="grid grid-cols-[1fr_8rem_2rem] items-center gap-2"
							>
								<input
									type="text"
									placeholder="Ej. Viajes"
									value={p.label}
									onChange={(e) =>
										updateProvision(p.id, { label: e.target.value })
									}
									className={inputClass}
								/>
								<input
									type="number"
									inputMode="decimal"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={p.annual_amount}
									onChange={(e) =>
										updateProvision(p.id, { annual_amount: e.target.value })
									}
									className={`${inputClass} text-right font-mono`}
								/>
								<button
									type="button"
									onClick={() => removeProvision(p.id)}
									aria-label="Eliminar provisión"
									className="text-slate-500 transition-colors hover:text-rose-400"
								>
									✕
								</button>
							</div>
						))}

						<button
							type="button"
							onClick={addProvision}
							className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700"
						>
							+ Agregar provisión
						</button>
					</div>
				)}
			</section>

			{/* Resumen fijo */}
			<section className="sticky bottom-24 z-10 rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-lg">
				<div className="flex items-center justify-between text-sm">
					<span className="text-slate-400">Provisión Mensual (anual ÷ 12)</span>
					<span className="font-mono text-slate-100">
						{formatCents(provisionMensualCents)}
					</span>
				</div>
				<div className="mt-2 flex items-center justify-between border-t border-slate-700 pt-2 text-sm">
					<span className="font-medium text-slate-300">Total Fijo Mensual</span>
					<span className="font-mono font-semibold text-slate-100">
						{formatCents(totalFijoCents)}
					</span>
				</div>
				<p className="mt-1 text-xs text-slate-500">
					Deuda {formatCents(debtCents)} + Provisión{" "}
					{formatCents(provisionMensualCents)}. Sale del 50 % de Necesidad.
				</p>

				{feedback && (
					<p
						className={`mt-3 text-xs ${
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
					className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isSaving ? "Guardando…" : "Guardar Configuración"}
				</button>
			</section>
		</div>
	);
}
