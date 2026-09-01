import { useEffect, useMemo, useState } from "react";
import { formatCents } from "../../lib/money";

/** Fecha local de hoy como YYYY-MM-DD (valor por defecto del selector). */
function todayISO() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Isla interactiva: botón "+ Ingreso" + modal. El usuario mete el monto real
 * (ej. 1500.50); el frontend lo pasa a centavos (× 100) y hace POST a
 * /api/register-income, que lo reparte con el modelo 50/30/20.
 *
 * ABONO PARCIAL: un ingreso pequeño es válido. Si el 50 % no alcanza para todo
 * el remanente fijo del mes, se muestra un aviso INFORMATIVO (no bloquea) y el
 * backend abona ese 50 % completo a Deuda/Provisión.
 *
 * @param {{
 *   pendingFixedCents?: number,       // remanente fijo por cubrir este mes
 *   alreadyPaidFixedCents?: number,   // (compat) fijo ya cubierto este mes
 * }} props
 */
export default function IncomeModal({
	pendingFixedCents = 0,
	alreadyPaidFixedCents = 0,
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [amountText, setAmountText] = useState("");
	const [effectiveDate, setEffectiveDate] = useState(todayISO());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);

	function close() {
		setIsOpen(false);
		setAmountText("");
		setEffectiveDate(todayISO());
		setError(null);
	}

	useEffect(() => {
		if (!isOpen) return;
		function onKeyDown(event) {
			if (event.key === "Escape") close();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen]);

	// Evaluación EN VIVO del abono parcial: si el 50 % del monto ingresado no
	// alcanza para el remanente fijo por cubrir del mes, este ingreso solo abona
	// una parte. NO bloquea nada; solo muestra un aviso informativo.
	const partialInfo = useMemo(() => {
		const parsed = Number.parseFloat(amountText);
		const amountCents =
			Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;

		const limiteNecesidad = Math.floor(amountCents / 2); // 50 % del ingreso
		const pendiente = Math.max(0, Math.round(pendingFixedCents));
		const isPartial = amountCents > 0 && pendiente > limiteNecesidad;

		return {
			isPartial,
			faltante: Math.max(0, pendiente - limiteNecesidad),
		};
	}, [amountText, pendingFixedCents]);

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const amount = Number.parseFloat(amountText);
		if (!Number.isFinite(amount) || amount <= 0) {
			setError("Introduce un monto mayor que 0.");
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
			setError("Selecciona una fecha válida.");
			return;
		}

		// Dólares -> centavos enteros (§2) antes de enviar.
		const amountCents = Math.round(amount * 100);

		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch("/api/register-income", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					amount_cents: amountCents,
					effective_date: effectiveDate,
				}),
			});

			if (response.ok) {
				close();
				window.location.reload();
				return;
			}

			const payload = await response.json().catch(() => ({}));
			setError(payload.error ?? `Error ${response.status}.`);
		} catch {
			setError("No se pudo conectar con el servidor.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
			>
				+ Ingreso
			</button>

			{isOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
					onClick={close}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Registrar ingreso"
						className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-sm font-semibold text-slate-100">
								Registrar ingreso
							</h2>
							<button
								type="button"
								onClick={close}
								aria-label="Cerrar"
								className="text-slate-400 transition-colors hover:text-slate-200"
							>
								✕
							</button>
						</div>

						<form onSubmit={handleSubmit} className="space-y-4">
							<label className="block space-y-1">
								<span className="text-xs uppercase tracking-wider text-slate-400">
									Monto
								</span>
								<input
									type="number"
									inputMode="decimal"
									step="0.01"
									min="0"
									placeholder="0.00"
									required
									value={amountText}
									onChange={(event) => setAmountText(event.target.value)}
									className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
								/>
							</label>

							<label className="block space-y-1">
								<span className="text-xs uppercase tracking-wider text-slate-400">
									Fecha
								</span>
								<input
									type="date"
									required
									value={effectiveDate}
									onChange={(event) => setEffectiveDate(event.target.value)}
									className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
								/>
							</label>

							<p className="text-xs text-slate-400">
								Se repartirá 50 % Necesidad · 30 % Deseo · 20 % Ahorro. La Deuda y
								la Provisión Mensual salen del 50 % de Necesidad.
							</p>

							{/* Aviso informativo de abono parcial (no bloquea) */}
							{partialInfo.isPartial && (
								<div className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-200">
									Este ingreso abonará parcialmente tus deudas y provisiones. Aún
									te faltarán{" "}
									<span className="font-mono font-semibold">
										{formatCents(partialInfo.faltante)}
									</span>{" "}
									por cubrir este mes.
								</div>
							)}

							{error && <p className="text-xs text-rose-400">{error}</p>}

							<button
								type="submit"
								disabled={isSubmitting}
								className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isSubmitting ? "Distribuyendo…" : "Registrar y distribuir"}
							</button>
						</form>
					</div>
				</div>
			)}
		</>
	);
}
