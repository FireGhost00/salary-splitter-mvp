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

/** Verde si es ingreso o monto positivo; rojo en caso contrario. */
function isPositive(tx) {
	return tx.transaction_type === "ingreso" || tx.amount_cents > 0;
}

/**
 * Agrupa transacciones consecutivas con el MISMO `created_at`. El motor de
 * ingresos inserta Deuda + Provisión + remanente en un solo batch, así que
 * comparten timestamp exacto y se muestran bajo una misma tarjeta.
 */
function toEvents(transactions) {
	const events = [];
	for (const tx of transactions) {
		const last = events[events.length - 1];
		if (last && last.createdAt === tx.created_at) {
			last.txs.push(tx);
		} else {
			events.push({ createdAt: tx.created_at, txs: [tx] });
		}
	}
	return events;
}

function Row({ tx, nested = false }) {
	const positive = isPositive(tx);
	const title = tx.description || tx.label || tx.category || "Movimiento";
	return (
		<li
			className={`flex items-center justify-between gap-3 px-4 ${
				nested ? "py-2.5" : "py-3"
			}`}
		>
			<div className="min-w-0">
				<p className="truncate text-sm text-slate-100">{title}</p>
				<p className="truncate text-xs text-slate-400">
					{tx.category}
					{!nested && tx.created_at ? ` · ${timeLabel(tx.created_at)}` : ""}
				</p>
			</div>
			<span
				className={`shrink-0 font-mono text-sm tabular-nums ${
					positive ? "text-emerald-400" : "text-rose-400"
				}`}
			>
				{formatCents(tx.amount_cents)}
			</span>
		</li>
	);
}

/**
 * Historial completo con paginación de 20 en 20. El primer lote llega por props
 * (SSR); las páginas siguientes se piden a GET /api/get-history?page=N.
 *
 * @param {{ transactions: Array<object> }} props  Primer lote (página 1).
 */
export default function TransactionHistory({ transactions = [] }) {
	const [rows, setRows] = useState(transactions);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

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
			// Salvaguarda: si una página posterior vino vacía, no avanzamos.
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
	// PASO 3: menos de 20 => no hay más historia.
	const hasNext = rows.length === PAGE_SIZE;

	if (rows.length === 0 && page === 1) {
		return (
			<p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-10 text-center text-sm text-slate-400">
				Sin movimientos todavía.
			</p>
		);
	}

	const events = toEvents(rows);
	let lastDay = null;

	return (
		<div className="space-y-4">
			<div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
				{events.map((event, index) => {
					const day = dayLabel(event.createdAt);
					const showDay = day !== lastDay;
					lastDay = day;

					const isBundle = event.txs.length > 1;
					const bundleTotal = event.txs.reduce((s, t) => s + t.amount_cents, 0);

					return (
						<div key={`${event.createdAt}-${index}`} className="space-y-2">
							{showDay && (
								<p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
									{day}
								</p>
							)}

							{isBundle ? (
								<div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
									<div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-900/60 px-4 py-2.5">
										<div className="min-w-0">
											<p className="text-xs font-semibold text-slate-200">
												Ingreso distribuido
											</p>
											<p className="text-[11px] text-slate-500">
												{timeLabel(event.createdAt)} · {event.txs.length}{" "}
												movimientos
											</p>
										</div>
										<span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-emerald-400">
											{formatCents(bundleTotal)}
										</span>
									</div>
									<ul className="divide-y divide-slate-700/60">
										{event.txs.map((tx) => (
											<Row key={tx.id} tx={tx} nested />
										))}
									</ul>
								</div>
							) : (
								<ul className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
									<Row tx={event.txs[0]} />
								</ul>
							)}
						</div>
					);
				})}
			</div>

			{error && <p className="text-xs text-rose-400">{error}</p>}

			{/* PASO 2 + 3: controles de paginación */}
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
	);
}
