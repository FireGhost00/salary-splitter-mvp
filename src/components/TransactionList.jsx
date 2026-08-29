import { useState } from "react";
import { formatCents } from "../lib/money";

const MONTHS_ES = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];

/** ISO (created_at / date) -> "01 sep" (hora local, sin librerías). */
function formatDate(iso) {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_ES[d.getMonth()] ?? ""}`;
}

/**
 * Lista vertical de movimientos (Modo Oscuro). Recibe las filas ya consultadas
 * y ordenadas en el servidor. La división entre 100 ocurre aquí vía formatCents
 * (CONVENCIONES.md §2). Verde = ingreso, rojo = gasto. Cada fila puede borrarse
 * (DELETE /api/delete-transaction) y se quita del estado local sin recargar.
 *
 * @param {{ transactions: Array<{
 *   id: number,
 *   category_id: string | null,
 *   description: string | null,
 *   label: string | null,
 *   amount_cents: number,
 *   transaction_type: string,
 *   created_at?: string | null,
 *   effective_date?: string | null,
 * }> }} props
 */
export default function TransactionList({ transactions = [] }) {
	const [rows, setRows] = useState(transactions);
	const [deletingId, setDeletingId] = useState(null);

	async function handleDelete(id) {
		if (deletingId != null) return;
		if (!window.confirm("¿Estás seguro de eliminar este registro?")) return;

		setDeletingId(id);
		try {
			const response = await fetch("/api/delete-transaction", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});

			if (response.ok) {
				setRows((prev) => prev.filter((tx) => tx.id !== id));
			} else {
				const payload = await response.json().catch(() => ({}));
				window.alert(payload.error ?? `Error ${response.status}.`);
			}
		} catch {
			window.alert("No se pudo conectar con el servidor.");
		} finally {
			setDeletingId(null);
		}
	}

	if (rows.length === 0) {
		return (
			<p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-8 text-center text-sm text-slate-400">
				Sin movimientos todavía.
			</p>
		);
	}

	return (
		<ul className="space-y-2">
			{rows.map((tx) => {
				const isIngreso = tx.transaction_type === "ingreso";
				return (
					<li
						key={tx.id}
						className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
					>
						<div className="min-w-0">
							<p className="truncate text-sm text-slate-100">
								{tx.description || tx.label || tx.category_id || "Movimiento"}
							</p>
							<p className="truncate text-xs text-slate-400">
								{tx.category_id ?? "Sin categoría"} ·{" "}
								{formatDate(tx.created_at ?? tx.effective_date)}
							</p>
						</div>

						<div className="flex shrink-0 items-center gap-3">
							<span
								className={`font-mono text-sm tabular-nums ${
									isIngreso ? "text-emerald-400" : "text-rose-400"
								}`}
							>
								{formatCents(tx.amount_cents)}
							</span>
							<button
								type="button"
								onClick={() => handleDelete(tx.id)}
								disabled={deletingId === tx.id}
								aria-label="Eliminar movimiento"
								className="text-slate-400 transition-colors hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.75"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="h-4 w-4"
									aria-hidden="true"
								>
									<path d="M3 6h18" />
									<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
									<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
									<path d="M10 11v6" />
									<path d="M14 11v6" />
								</svg>
							</button>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
