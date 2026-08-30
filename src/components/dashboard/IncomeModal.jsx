import { useEffect, useMemo, useState } from "react";
import { formatCents } from "../../lib/money";

/**
 * Isla interactiva: botón "+ Ingreso" + modal. El usuario mete el monto real
 * (ej. 1500.50); el frontend lo pasa a centavos (× 100) y hace POST a
 * /api/register-income, que lo reparte con el modelo 50/30/20.
 *
 * Evaluación de déficit EN VIVO: se compara el 50 % del monto ingresado contra
 * el REMANENTE fijo por cubrir este mes (deuda + provisiones que aún NO se han
 * pagado con ingresos anteriores). Si ya cubriste tu cuota fija del mes, el
 * remanente es $0 y no hay alerta. El endpoint hace la misma comprobación como
 * red de seguridad (409 `deficit: true`).
 *
 * @param {{
 *   pendingFixedCents?: number,       // remanente fijo por cubrir este mes
 *   alreadyPaidFixedCents?: number,   // fijo ya cubierto este mes
 * }} props
 */
export default function IncomeModal({
	pendingFixedCents = 0,
	alreadyPaidFixedCents = 0,
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [amountText, setAmountText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);
	const [serverDeficit, setServerDeficit] = useState(null);

	function close() {
		setIsOpen(false);
		setAmountText("");
		setError(null);
		setServerDeficit(null);
	}

	useEffect(() => {
		if (!isOpen) return;
		function onKeyDown(event) {
			if (event.key === "Escape") close();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen]);

	// --- PASO 2: evaluación reactiva del déficit ------------------------
	// El déficit se mide contra el REMANENTE fijo por cubrir, no contra la
	// cuota fija total: (remanenteFijoPorCubrir) > (montoIngresado * 0.50).
	const evalDeficit = useMemo(() => {
		const parsed = Number.parseFloat(amountText);
		const amountCents =
			Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;

		const limiteNecesidad = Math.floor(amountCents / 2); // 50 % del ingreso
		const pendiente = Math.max(0, Math.round(pendingFixedCents));
		const yaCubierto = Math.max(0, Math.round(alreadyPaidFixedCents));
		const isDeficit = amountCents > 0 && pendiente > limiteNecesidad;

		return {
			amountCents,
			limiteNecesidad,
			pendiente,
			yaCubierto,
			faltante: Math.max(0, pendiente - limiteNecesidad),
			isDeficit,
		};
	}, [amountText, pendingFixedCents, alreadyPaidFixedCents]);

	// Vista unificada del banner: el detalle del servidor manda si existe.
	const deficitView = serverDeficit
		? {
				pendiente: serverDeficit.fixed_cents,
				yaCubierto: serverDeficit.already_paid_cents ?? 0,
				limiteNecesidad: serverDeficit.necesidad_cents,
				faltante: serverDeficit.over_cents,
			}
		: evalDeficit;

	const showDeficit = evalDeficit.isDeficit || serverDeficit != null;

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const amount = Number.parseFloat(amountText);
		if (!Number.isFinite(amount) || amount <= 0) {
			setError("Introduce un monto mayor que 0.");
			return;
		}

		// Dólares -> centavos enteros (§2) antes de enviar.
		const amountCents = Math.round(amount * 100);

		setIsSubmitting(true);
		setError(null);
		setServerDeficit(null);
		try {
			const response = await fetch("/api/register-income", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ amount_cents: amountCents }),
			});

			if (response.ok) {
				close();
				window.location.reload();
				return;
			}

			const payload = await response.json().catch(() => ({}));
			if (payload.deficit && payload.detail) {
				// Nada quedó registrado: se muestra el desglose y el modal sigue abierto.
				setServerDeficit(payload.detail);
			} else {
				setError(payload.error ?? `Error ${response.status}.`);
			}
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

							<p className="text-xs text-slate-400">
								Se repartirá 50 % Necesidad · 30 % Deseo · 20 % Ahorro. La Deuda y
								la Provisión Mensual salen del 50 % de Necesidad.
							</p>

							{/* PASO 2 + 3: banner crítico de déficit */}
							{showDeficit && (
								<div className="mb-4 rounded-lg border border-rose-500 bg-rose-950/40 p-4">
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
												necesidades. Tendrás que ajustar tus gastos de Deseo o
												Ahorro para cubrir el déficit de este mes.
											</p>
											<p className="text-rose-400/80">
												Te falta cubrir{" "}
												{formatCents(deficitView.pendiente)} de deuda/provisiones
												este mes
												{deficitView.yaCubierto > 0
													? ` (ya cubriste ${formatCents(deficitView.yaCubierto)})`
													: ""}
												{" "}&gt; 50 % = {formatCents(deficitView.limiteNecesidad)}.
												Déficit: {formatCents(deficitView.faltante)}.
											</p>
										</div>
									</div>
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
