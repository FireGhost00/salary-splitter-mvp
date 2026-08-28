import { useEffect, useState } from "react";

/**
 * Isla interactiva: botón flotante que abre un modal para registrar un gasto
 * rápido. Envía el monto en dólares a POST /api/expense, que lo convierte a
 * centavos negativos e inserta en `transactions`.
 *
 * @param {{ categories: { id: string, title: string }[] }} props
 */
export default function QuickExpenseModal({ categories = [] }) {
	const [isOpen, setIsOpen] = useState(false);
	const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
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

		const category = categories.find((item) => item.id === categoryId);

		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch("/api/expense", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					amount,
					category_id: categoryId,
					label: category?.title ?? categoryId,
				}),
			});

			if (response.status === 200) {
				close();
				// Recarga para reflejar el nuevo saldo (aún no hay store global).
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
				aria-label="Registrar gasto rápido"
				className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-2xl leading-none text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
			>
				+
			</button>

			{isOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
					onClick={close}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Gasto rápido"
						className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-sm font-semibold text-slate-100">Gasto rápido</h2>
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
									Categoría
								</span>
								<select
									value={categoryId}
									onChange={(event) => setCategoryId(event.target.value)}
									className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
								>
									{categories.map((item) => (
										<option key={item.id} value={item.id}>
											{item.title}
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
								{isSubmitting ? "Descontando…" : "Descontar"}
							</button>
						</form>
					</div>
				</div>
			)}
		</>
	);
}
