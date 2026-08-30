import { useState } from "react";
import { formatCents } from "../lib/money";

/** Debe coincidir con PAGE_SIZE de /api/get-history. */
const PAGE_SIZE = 20;

const MONTHS_ES = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];

function toDate(iso) {
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** "Hoy" / "Ayer" / "05 sep 2026". */
function dayLabel(iso) {
	const d = toDate(iso);
	if (!d) return "Sin fecha";
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	const sameDay = (a, b) =>
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();
	if (sameDay(d, today)) return "Hoy";
	if (sameDay(d, yesterday)) return "Ayer";
	return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function timeLabel(iso) {
	const d = toDate(iso);
	if (!d) return "";
	return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function isPositive(tx) {
	return tx.transaction_type === "ingreso" || tx.amount_cents > 0;
}

/**
 * Identificador para borrar el ingreso GLOBAL al que pertenece una fila:
 *  - `group_id` si existe.
 *  - `created_at` exacto para datos viejos de ingreso sin group_id.
 *  - null si la fila no forma parte de un ingreso (gasto suelto).
 */
function groupRefOf(tx) {
	if (tx.group_id) return { type: "group", groupId: tx.group_id };
	if (tx.transaction_type === "ingreso" && tx.created_at) {
		return { type: "created_at", createdAt: tx.created_at };
	}
	return null;
}

function TrashIcon() {
	return (
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
	);
}

/**
 * PASO 1: agrupación estricta. Los movimientos de tipo 'ingreso' que comparten
 * `group_id` (o, para datos viejos, el mismo `created_at`) se colapsan en UN
 * solo objeto con el total sumado. Los gastos quedan tal cual. Usa un Map para
 * no depender de que las filas estén contiguas; conserva el orden.
 */
function processRows(transactions) {
	const out = [];
	const groupIndex = new Map();

	for (const tx of transactions) {
		const isIncome = tx.transaction_type === "ingreso";
		const key = isIncome
			? tx.group_id
				? `g:${tx.group_id}`
				: tx.created_at
					? `c:${tx.created_at}`
					: null
			: null;

		if (key == null) {
			out.push({ kind: "tx", tx });
			continue;
		}

		if (groupIndex.has(key)) {
			const g = out[groupIndex.get(key)];
			g.totalCents += Number(tx.amount_cents) || 0;
			g.count += 1;
		} else {
			groupIndex.set(key, out.length);
			out.push({
				kind: "group",
				key,
				ref: tx.group_id
					? { type: "group", groupId: tx.group_id }
					: { type: "created_at", createdAt: tx.created_at },
				createdAt: tx.created_at,
				totalCents: Number(tx.amount_cents) || 0,
				count: 1,
			});
		}
	}
	return out;
}

function Row({ tx, onDelete }) {
	const positive = isPositive(tx);
	const title = tx.description || tx.label || tx.category || "Movimiento";
	return (
		<li className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<p className="truncate text-sm text-slate-100">{title}</p>
				<p className="truncate text-xs text-slate-400">
					{tx.category}
					{tx.created_at ? ` · ${timeLabel(tx.created_at)}` : ""}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				<span
					className={`font-mono text-sm tabular-nums ${
						positive ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{formatCents(tx.amount_cents)}
				</span>
				<button
					type="button"
					onClick={onDelete}
					aria-label="Eliminar movimiento"
					className="text-slate-400 transition-colors hover:text-rose-500"
				>
					<TrashIcon />
				</button>
			</div>
		</li>
	);
}

/** PASO 2: una sola fila maestra por ingreso agrupado. */
function GroupRow({ group, onDelete }) {
	return (
		<li className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<p className="truncate text-sm text-slate-100">Ingreso Registrado</p>
				<p className="truncate text-xs text-slate-400">
					{group.createdAt ? timeLabel(group.createdAt) : ""}
					{group.count > 1 ? ` · ${group.count} movimientos` : ""}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				<span className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
					{formatCents(group.totalCents)}
				</span>
				<button
					type="button"
					onClick={onDelete}
					aria-label="Eliminar ingreso registrado"
					className="text-slate-400 transition-colors hover:text-rose-500"
				>
					<TrashIcon />
				</button>
			</div>
		</li>
	);
}

/**
 * Historial completo con paginación de 20 en 20. Primer lote por props (SSR);
 * las páginas siguientes vía GET /api/get-history?page=N.
 *
 * Las transacciones se muestran en filas individuales. Al borrar una fila que
 * pertenece a un ingreso, se abre el modal de confirmación y se elimina el
 * ingreso GLOBAL completo (todas las filas con ese `group_id`).
 *
 * @param {{ transactions: Array<object> }} props
 */
export default function TransactionHistory({ transactions = [] }) {
	const [rows, setRows] = useState(transactions);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	// PASO 2: modal de confirmación en React (diálogo propio).
	// `groupToDelete` = ref de lo que se borra:
	//   { type: "group", groupId } | { type: "created_at", createdAt } | { type: "single", id }
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [groupToDelete, setGroupToDelete] = useState(null);
	const [deleting, setDeleting] = useState(false);
	const [modalError, setModalError] = useState(null);

	function requestDelete(ref) {
		setModalError(null);
		setGroupToDelete(ref);
		setIsModalOpen(true);
	}

	function closeModal() {
		setIsModalOpen(false);
	}

	async function confirmDelete() {
		if (deleting || !groupToDelete) return;
		setDeleting(true);
		setModalError(null);
		try {
			const t = groupToDelete;
			const body =
				t.type === "group"
					? { group_id: t.groupId }
					: t.type === "created_at"
						? { created_at: t.createdAt }
						: { id: t.id };
			const res = await fetch("/api/delete-transaction", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (res.ok) {
				window.location.reload();
				return;
			}
			const payload = await res.json().catch(() => ({}));
			setModalError(payload.error ?? `Error ${res.status}.`);
		} catch {
			setModalError("No se pudo conectar con el servidor.");
		} finally {
			setDeleting(false);
		}
	}

	async function goToPage(target) {
		if (target < 1 || loading || target === page) return;
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(`/api/get-history?page=${target}`);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				setError(payload.error ?? `Error ${response.status}.`);
				return;
			}
			const batch = payload.transactions ?? [];
			if (batch.length === 0 && target > page) return;
			setRows(batch);
			setPage(target);
			if (typeof window !== "undefined") {
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		} catch {
			setError("No se pudo cargar la página.");
		} finally {
			setLoading(false);
		}
	}

	const hasPrev = page > 1;
	const hasNext = rows.length === PAGE_SIZE;

	if (rows.length === 0 && page === 1) {
		return (
			<p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-10 text-center text-sm text-slate-400">
				Sin movimientos todavía.
			</p>
		);
	}

	// PASO 1: colapsa los ingresos agrupados; luego agrupa visualmente por día.
	const items = processRows(rows);
	const byDay = [];
	for (const item of items) {
		const iso = item.kind === "group" ? item.createdAt : item.tx.created_at;
		const day = dayLabel(iso);
		const last = byDay[byDay.length - 1];
		if (last && last.day === day) last.items.push(item);
		else byDay.push({ day, items: [item] });
	}

	return (
		<>
			<div className="space-y-4">
				<div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
					{byDay.map((bucket) => (
						<div key={bucket.day} className="space-y-2">
							<p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
								{bucket.day}
							</p>
							<ul className="divide-y divide-slate-700/60 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
								{bucket.items.map((item) =>
									item.kind === "group" ? (
										<GroupRow
											key={item.key}
											group={item}
											onDelete={() => requestDelete(item.ref)}
										/>
									) : (
										<Row
											key={item.tx.id}
											tx={item.tx}
											onDelete={() =>
												requestDelete(
													groupRefOf(item.tx) ?? {
														type: "single",
														id: item.tx.id,
													},
												)
											}
										/>
									),
								)}
							</ul>
						</div>
					))}
				</div>

				{error && <p className="text-xs text-rose-400">{error}</p>}

				<nav
					className="flex items-center justify-between gap-2 pt-2"
					aria-label="Paginación del historial"
				>
					<button
						type="button"
						onClick={() => goToPage(page - 1)}
						disabled={!hasPrev || loading}
						className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						← Anterior
					</button>
					<span className="text-xs text-slate-500">
						{loading ? "Cargando…" : `Página ${page}`}
					</span>
					<button
						type="button"
						onClick={() => goToPage(page + 1)}
						disabled={!hasNext || loading}
						className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Siguiente →
					</button>
				</nav>
			</div>

			{isModalOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
					onClick={closeModal}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Confirmar eliminación"
						className="mx-4 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-start gap-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.75"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="mt-0.5 h-6 w-6 shrink-0 text-rose-400"
								aria-hidden="true"
							>
								<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
								<line x1="12" y1="9" x2="12" y2="13" />
								<line x1="12" y1="17" x2="12.01" y2="17" />
							</svg>
							<h2 className="text-sm font-semibold text-slate-100">
								¿Eliminar el ingreso completo y su distribución?
							</h2>
						</div>

						{modalError && (
							<p className="mt-3 text-xs text-rose-400">{modalError}</p>
						)}

						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={closeModal}
								disabled={deleting}
								className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={confirmDelete}
								disabled={deleting}
								className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{deleting ? "Eliminando…" : "Sí, eliminar"}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
