import { useMemo, useState } from "react";
import { formatCents } from "../lib/money";

const MONTHS_ES = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];
const MONTHS_ES_LONG = [
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Cuántos movimientos por página en el paginador. */
const PAGE_SIZE = 10;

function toDate(iso) {
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO -> "01 sep" (hora local, sin librerías). */
function formatDate(iso) {
	const d = toDate(iso);
	if (!d) return "—";
	return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_ES[d.getMonth()] ?? ""}`;
}

/** ISO -> "2026-09" (mes local) para el filtro mensual. */
function monthKeyOf(iso) {
	const d = toDate(iso);
	if (!d) return null;
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Lista vertical de movimientos (Modo Oscuro). Recibe las filas ya consultadas
 * y ordenadas en el servidor. La división entre 100 ocurre aquí vía formatCents
 * (CONVENCIONES.md §2). Verde = ingreso, rojo = gasto. Cada fila puede borrarse
 * (DELETE /api/delete-transaction) y se quita del estado local sin recargar.
 *
 * Encima de la tabla: filtro mensual + filtro por tipo. Debajo: paginador simple
 * (PAGE_SIZE por página), que solo aparece si hay más de una página.
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

	// Modal de confirmación en React (diálogo propio, sin diálogos nativos).
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [idToDelete, setIdToDelete] = useState(null);
	const [modalError, setModalError] = useState(null);

	const dateOf = (tx) => tx.created_at ?? tx.effective_date;

	// Mes en curso como "YYYY-MM" (el dashboard es una vista mensual).
	const currentMonthKey = useMemo(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	}, []);

	// Meses presentes en los datos, del más reciente al más antiguo.
	const monthOptions = useMemo(() => {
		const keys = new Set();
		for (const tx of rows) {
			const k = monthKeyOf(dateOf(tx));
			if (k) keys.add(k);
		}
		return [...keys]
			.sort()
			.reverse()
			.map((k) => {
				const [y, m] = k.split("-");
				return { value: k, label: `${MONTHS_ES_LONG[Number(m) - 1]} ${y}` };
			});
	}, [rows]);

	// --- Filtros ----------------------------------------------------------
	const [monthFilter, setMonthFilter] = useState(() =>
		rows.some((tx) => monthKeyOf(dateOf(tx)) === currentMonthKey)
			? currentMonthKey
			: "",
	);
	const [typeFilter, setTypeFilter] = useState("todos"); // todos | ingresos | gastos
	const [page, setPage] = useState(1);

	function setFilter(setter, value) {
		setter(value);
		setPage(1);
	}

	const filtered = useMemo(() => {
		return rows.filter((tx) => {
			if (monthFilter && monthKeyOf(dateOf(tx)) !== monthFilter) return false;
			if (typeFilter === "ingresos" && tx.amount_cents <= 0) return false;
			if (typeFilter === "gastos" && tx.amount_cents >= 0) return false;
			return true;
		});
	}, [rows, monthFilter, typeFilter]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const pageRows = filtered.slice(
		(safePage - 1) * PAGE_SIZE,
		safePage * PAGE_SIZE,
	);

	// El basurero SOLO abre el modal.
	function requestDelete(id) {
		setModalError(null);
		setIdToDelete(id);
		setIsModalOpen(true);
	}

	// El único que llama a la API de borrado.
	async function confirmDelete() {
		if (deletingId != null || idToDelete == null) return;
		const id = idToDelete;
		setDeletingId(id);
		setModalError(null);
		try {
			const response = await fetch("/api/delete-transaction", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});

			if (response.ok) {
				setRows((prev) => prev.filter((tx) => tx.id !== id));
				setIsModalOpen(false);
				setIdToDelete(null);
			} else {
				const payload = await response.json().catch(() => ({}));
				setModalError(payload.error ?? `Error ${response.status}.`);
			}
		} catch {
			setModalError("No se pudo conectar con el servidor.");
		} finally {
			setDeletingId(null);
		}
	}

	const selectClass =
		"rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

	return (
		<>
		<div className="space-y-3">
			{/* Filtros encima de la tabla */}
			<div className="flex flex-wrap gap-2">
				<select
					value={monthFilter}
					onChange={(e) => setFilter(setMonthFilter, e.target.value)}
					className={selectClass}
					aria-label="Filtrar por mes"
				>
					<option value="">Todos los meses</option>
					{monthOptions.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>

				<select
					value={typeFilter}
					onChange={(e) => setFilter(setTypeFilter, e.target.value)}
					className={selectClass}
					aria-label="Filtrar por tipo"
				>
					<option value="todos">Todos</option>
					<option value="ingresos">Ingresos</option>
					<option value="gastos">Gastos</option>
				</select>
			</div>

			{/* Lista */}
			{pageRows.length === 0 ? (
				<p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-8 text-center text-sm text-slate-400">
					{rows.length === 0
						? "Sin movimientos todavía."
						: "Sin movimientos para estos filtros."}
				</p>
			) : (
				<ul className="space-y-2">
					{pageRows.map((tx) => {
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
										onClick={() => requestDelete(tx.id)}
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
			)}

			{/* Paginador simple: solo si hay más de una página */}
			{filtered.length > PAGE_SIZE && (
				<div className="flex items-center justify-between gap-2 pt-1">
					<button
						type="button"
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={safePage <= 1}
						className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						← Anterior
					</button>
					<span className="text-xs text-slate-500">
						Página {safePage} de {totalPages}
					</span>
					<button
						type="button"
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						disabled={safePage >= totalPages}
						className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Siguiente →
					</button>
				</div>
			)}
		</div>

		{isModalOpen && (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
				<div className="mx-4 max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6">
					<p className="text-sm font-semibold text-slate-100">
						¿Eliminar este movimiento?
					</p>
					{modalError && (
						<p className="mt-2 text-xs text-rose-400">{modalError}</p>
					)}
					<div className="mt-5 flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setIsModalOpen(false)}
							disabled={deletingId != null}
							className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={confirmDelete}
							disabled={deletingId != null}
							className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{deletingId != null ? "Eliminando…" : "Sí, eliminar"}
						</button>
					</div>
				</div>
			</div>
		)}
		</>
	);
}
