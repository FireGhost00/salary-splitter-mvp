import { useEffect, useState } from "react";

/**
 * Isla interactiva: botón "+ Ingreso" + modal. El usuario mete el monto real
 * (ej. 1500.50); el frontend lo pasa a centavos (× 100) y hace POST a
 * /api/register-income, que lo reparte entre los sobres según distribution_rules.
 */
export default function IncomeModal() {
	const [isOpen, setIsOpen] = useState(false);
	const [amountText, setAmountText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);

	function close() {
		setIsOpen(false);
		setAmountText("");
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

							<p className="text-xs text-slate-400">
								Se repartirá entre tus sobres según las reglas de distribución.
							</p>

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
