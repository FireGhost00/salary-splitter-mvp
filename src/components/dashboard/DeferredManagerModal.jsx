import { useEffect, useRef, useState } from "react";
import { formatCents } from "../../lib/money";

const MONTHS_ES = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];

/** "2026-09-01" -> "01 sep" (sin problemas de zona horaria). */
function formatDate(iso) {
	if (!iso) return "—";
	const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
	if (!y || !m || !d) return "—";
	return `${String(d).padStart(2, "0")} ${MONTHS_ES[m - 1] ?? ""}`;
}

/**
 * Modal para revisar/borrar los ingresos diferidos (reservados para meses
 * futuros). Carga la lista de GET /api/transaction/deferred y borra vía
 * POST /api/transaction/delete (misma auth SSR + RLS que el resto de la app).
 *
 * @param {{ userId?: string, onClose: (didDelete: boolean) => void }} props
 */
export default function DeferredManagerModal({ onClose }) {
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [deletingId, setDeletingId] = useState(null);
	const didDeleteRef = useRef(false);

	function close() {
		onClose(didDeleteRef.current);
	}

	useEffect(() => {
		let cancelled = false;

		(async () => {
			setLoading(true);
			setError(null);
			try {
				const response = await fetch("/api/transaction/deferred");
				const payload = await response.json().catch(() => ({}));
				if (cancelled) return;
				if (response.status === 200) {
					setRows(payload.transactions ?? []);
				} else {
					setError(payload.error ?? `Error ${response.status}.`);
				}
			} catch {
				if (!cancelled) setError("No se pudo conectar con el servidor.");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		function onKeyDown(event) {
			if (event.key === "Escape") close();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function handleDelete(id) {
		if (deletingId != null) return;
		if (!window.confirm("¿Eliminar este ingreso reservado?")) return;

		setDeletingId(id);
		try {
			const response = await fetch("/api/transaction/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});

			if (response.status === 200) {
				didDeleteRef.current = true;
				setRows((prev) => prev.filter((row) => row.id !== id));
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

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={close}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Ingresos reservados"
				className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="mb-4 flex items-center justify-between gap-3">
					<h2 className="text-sm font-semibold text-slate-100">
						Reservado para el próximo mes
					</h2>
					<button
						type="button"
						onClick={close}
						aria-label="Cerrar"
						className="text-slate-500 transition-colors hover:text-slate-300"
					>
						✕
					</button>
				</div>

				{loading && <p className="text-xs text-slate-500">Cargando…</p>}
				{error && <p className="text-xs text-rose-400">{error}</p>}
				{!loading && !error && rows.length === 0 && (
					<p className="text-xs text-slate-500">No hay ingresos reservados.</p>
				)}

				{rows.length > 0 && (
					<ul className="divide-y divide-slate-800">
						{rows.map((row) => (
							<li
								key={row.id}
								className="flex items-center justify-between gap-3 py-2.5"
							>
								<div className="min-w-0">
									<p className="truncate text-sm text-slate-100">
										{row.description || row.label}
									</p>
									<p className="text-xs text-slate-500">
										{formatDate(row.effective_date)}
									</p>
								</div>

								<div className="flex shrink-0 items-center gap-3">
									<span className="font-mono text-sm text-emerald-400">
										{formatCents(row.amount_cents)}
									</span>
									<button
										type="button"
										onClick={() => handleDelete(row.id)}
										disabled={deletingId === row.id}
										aria-label="Eliminar ingreso reservado"
										className="text-slate-600 transition-colors hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
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
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
