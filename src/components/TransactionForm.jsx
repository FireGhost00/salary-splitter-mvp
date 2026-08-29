import { useState } from "react";

/** Fecha local de hoy como YYYY-MM-DD (valor por defecto del input date). */
function todayISO() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none";

/**
 * Formulario de captura de un movimiento. Hace POST a /api/transactions y, si
 * la petición fue exitosa, reinicia los campos.
 *
 * @param {{ categories?: { id: string, name: string }[], onCreated?: () => void }} props
 */
export default function TransactionForm({ categories = [], onCreated }) {
	const [amount, setAmount] = useState("");
	const [transactionType, setTransactionType] = useState("gasto");
	const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
	const [effectiveDate, setEffectiveDate] = useState(todayISO());
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);

	function resetFields() {
		setAmount("");
		setDescription("");
		setEffectiveDate(todayISO());
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const value = Number.parseFloat(amount);
		if (!Number.isFinite(value) || value <= 0) {
			setError("Introduce un monto mayor que 0.");
			return;
		}
		if (!categoryId) {
			setError("Selecciona una categoría.");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch("/api/transactions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					// El endpoint multiplica por 100 -> amount_cents.
					amount: value,
					transaction_type: transactionType,
					category_id: categoryId,
					effective_date: effectiveDate,
					description: description.trim(),
				}),
			});

			if (response.ok) {
				resetFields();
				onCreated?.();
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
		<form
			onSubmit={handleSubmit}
			className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block space-y-1">
					<span className="text-xs uppercase tracking-wider text-slate-500">
						Monto
					</span>
					<input
						type="number"
						inputMode="decimal"
						step="0.01"
						min="0"
						required
						placeholder="0.00"
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						className={`${inputClass} font-mono`}
					/>
				</label>

				<label className="block space-y-1">
					<span className="text-xs uppercase tracking-wider text-slate-500">
						Tipo
					</span>
					<select
						value={transactionType}
						onChange={(event) => setTransactionType(event.target.value)}
						className={inputClass}
					>
						<option value="gasto">Gasto</option>
						<option value="ingreso">Ingreso</option>
					</select>
				</label>

				<label className="block space-y-1">
					<span className="text-xs uppercase tracking-wider text-slate-500">
						Categoría
					</span>
					<select
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						className={inputClass}
					>
						{categories.length === 0 && (
							<option value="">Sin categorías</option>
						)}
						{categories.map((cat) => (
							<option key={cat.id} value={cat.id}>
								{cat.name}
							</option>
						))}
					</select>
				</label>

				<label className="block space-y-1">
					<span className="text-xs uppercase tracking-wider text-slate-500">
						Fecha
					</span>
					<input
						type="date"
						required
						value={effectiveDate}
						onChange={(event) => setEffectiveDate(event.target.value)}
						className={inputClass}
					/>
				</label>
			</div>

			<label className="block space-y-1">
				<span className="text-xs uppercase tracking-wider text-slate-500">
					Descripción (opcional)
				</span>
				<input
					type="text"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Ej. Súper del sábado"
					className={inputClass}
				/>
			</label>

			{error && <p className="text-xs text-rose-400">{error}</p>}

			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isSubmitting ? "Guardando…" : "Guardar movimiento"}
			</button>
		</form>
	);
}
