import { useEffect, useState } from "react";

const QUINCENAS = [
	{ value: "Q1", label: "Quincena 1" },
	{ value: "Q2", label: "Quincena 2" },
];

/** Quincena sugerida según el día del mes (1–15 => Q1). */
function defaultQuincena() {
	return new Date().getDate() <= 15 ? "Q1" : "Q2";
}

/**
 * Isla interactiva: botón + modal para registrar un ingreso (salario). Al enviar
 * hace POST /api/distribute con el monto; el endpoint lo reparte entre los
 * sobres según las reglas del usuario. El monto se envía en la moneda (dólares);
 * la conversión a centavos ocurre en el servidor (CONVENCIONES.md §2).
 */
export default function IncomeModal() {
	const [isOpen, setIsOpen] = useState(false);
	const [quincena, setQuincena] = useState(defaultQuincena());
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

		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch("/api/distribute", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ salary: amount, quincena }),
			});

			if (response.status === 200) {
				close();
				// Recarga para reflejar los nuevos saldos (aún no hay store global).
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
				className="rounded-lg border border-emerald-600/60 bg-emerald-600/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-600/20"
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
						className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-sm font-semibold text-slate-100">Registrar ingreso</h2>
							<button
								type="button"
								onClick={close}
								aria-label="Cerrar"
								className="text-slate-500 transition-colors hover:text-slate-300"
							>
								✕
							</button>
						</div>

						<form onSubmit={handleSubmit} className="space-y-4">
							<label className="block space-y-1">
								<span className="text-xs uppercase tracking-wider text-slate-500">
									Quincena
								</span>
								<select
									value={quincena}
									onChange={(event) => setQuincena(event.target.value)}
									className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
								>
									{QUINCENAS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</label>

							<label className="block space-y-1">
								<span className="text-xs uppercase tracking-wider text-slate-500">
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
									className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
								/>
							</label>

							{error && <p className="text-xs text-rose-400">{error}</p>}

							<button
								type="submit"
								disabled={isSubmitting}
								className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isSubmitting ? "Distribuyendo…" : "Distribuir"}
							</button>
						</form>
					</div>
				</div>
			)}
		</>
	);
}
