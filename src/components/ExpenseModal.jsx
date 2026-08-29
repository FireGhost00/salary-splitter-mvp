import { useEffect, useMemo, useState } from "react";
import { formatCents } from "../lib/money";

/** Orden y etiqueta de los grupos del <select> por macro_type. */
const MACRO_GROUPS = [
	{ key: "estandar", label: "Maestras (50/30/20)" },
	{ key: "deuda", label: "Deudas" },
	{ key: "provision", label: "Provisiones" },
];

/** Agrupa las categorías por macro_type; lo desconocido cae en "Otras". */
function groupCategories(categories) {
	const buckets = new Map(MACRO_GROUPS.map((g) => [g.key, []]));
	const otras = [];
	for (const c of categories) {
		const bucket = buckets.get(c.macro_type);
		if (bucket) bucket.push(c);
		else otras.push(c);
	}
	const groups = MACRO_GROUPS.map((g) => ({
		label: g.label,
		items: buckets.get(g.key),
	})).filter((g) => g.items.length > 0);
	if (otras.length > 0) groups.push({ label: "Otras", items: otras });
	return groups;
}

/**
 * Modal de Gasto Rápido (Modo Oscuro). Presentacional + envío.
 *
 * Se muestra cuando `open` es true y se cierra con `onClose` (botón ✕, click en
 * el fondo o Escape). Las categorías llegan por props (TODAS: maestras + Deudas
 * + Provisiones); el <select> las agrupa por macro_type y usa el `id` como value.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   categories?: { id: string, name: string, macro_type?: string }[],
 * }} props
 */
export default function ExpenseModal({ open, onClose, categories = [] }) {
	const categoryGroups = useMemo(
		() => groupCategories(categories),
		[categories],
	);
	const [categoryId, setCategoryId] = useState("");
	const selectedCategory = categories.find((c) => c.id === categoryId);
	const [amountText, setAmountText] = useState("");
	const [concept, setConcept] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);

	// Al abrir: preselecciona la primera categoría y limpia errores.
	useEffect(() => {
		if (!open) return;
		setCategoryId((prev) => prev || categories[0]?.id || "");
		setError(null);
	}, [open, categories]);

	// Cerrar con Escape.
	useEffect(() => {
		if (!open) return;
		function onKey(event) {
			if (event.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	function resetAndClose() {
		setAmountText("");
		setConcept("");
		setError(null);
		onClose();
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		const amount = Number.parseFloat(amountText);
		if (!Number.isFinite(amount) || amount <= 0) {
			setError("Introduce un monto mayor que 0.");
			return;
		}
		if (!categoryId) {
			setError("Elige una categoría.");
			return;
		}

		// Patrón Money (CONVENCIONES.md §2): a centavos enteros con Math.round.
		// El backend lo registra como transaction_type 'gasto' y en negativo.
		const amountCents = Math.round(amount * 100);
		const category = categories.find((c) => c.id === categoryId);

		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch("/api/expense", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					amount_cents: amountCents,
					category_id: categoryId,
					label: category?.name ?? categoryId,
					description: concept.trim(),
				}),
			});

			if (response.status === 200) {
				resetAndClose();
				// Recarga para que el Dashboard recalcule los saldos.
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
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
			onClick={resetAndClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Gasto rápido"
				className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-sm font-semibold text-slate-100">Gasto rápido</h2>
					<button
						type="button"
						onClick={resetAndClose}
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
							Categoría
						</span>
						<select
							value={categoryId}
							onChange={(event) => setCategoryId(event.target.value)}
							required
							className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						>
							{categories.length === 0 && (
								<option value="">Sin categorías</option>
							)}
							{categoryGroups.map((group) => (
								<optgroup
									key={group.label}
									label={group.label}
									className="bg-slate-900 text-slate-400"
								>
									{group.items.map((category) => (
										<option
											key={category.id}
											value={category.id}
											className="bg-slate-900 text-slate-100"
										>
											{category.name}
										</option>
									))}
								</optgroup>
							))}
						</select>
						{selectedCategory &&
							typeof selectedCategory.availableCents === "number" && (
								<p className="text-xs text-slate-400">
									{selectedCategory.name} — Disponible:{" "}
									<span
										className={`font-mono ${
											selectedCategory.availableCents < 0
												? "text-rose-400"
												: "text-emerald-400"
										}`}
									>
										{formatCents(selectedCategory.availableCents)}
									</span>
								</p>
							)}
					</label>

					<label className="block space-y-1">
						<span className="text-xs uppercase tracking-wider text-slate-400">
							Concepto o nota (opcional)
						</span>
						<input
							type="text"
							value={concept}
							onChange={(event) => setConcept(event.target.value)}
							placeholder="Ej. Súper del sábado"
							className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
					</label>

					{error && <p className="text-xs text-rose-400">{error}</p>}

					<button
						type="submit"
						disabled={isSubmitting}
						className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isSubmitting ? "Descontando…" : "Descontar"}
					</button>
				</form>
			</div>
		</div>
	);
}
