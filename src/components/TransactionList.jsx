import { formatCents } from "../lib/money";

const MONTHS_ES = [
	"ene", "feb", "mar", "abr", "may", "jun",
	"jul", "ago", "sep", "oct", "nov", "dic",
];

/** "2026-09-01" -> "01 sep 2026" (sin problemas de zona horaria). */
function formatDate(iso) {
	if (!iso) return "—";
	const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
	if (!y || !m || !d) return "—";
	return `${String(d).padStart(2, "0")} ${MONTHS_ES[m - 1] ?? ""} ${y}`;
}

/**
 * Historial de movimientos (presentacional). Las filas ya vienen consultadas y
 * ordenadas desde el servidor. La división entre 100 ocurre SOLO aquí, vía
 * formatCents (CONVENCIONES.md §2), formateado como USD.
 *
 * @param {{ transactions: Array<{
 *   id: number,
 *   effective_date: string | null,
 *   description: string | null,
 *   label: string | null,
 *   category_id: string,
 *   amount_cents: number,
 *   transaction_type: string,
 * }> }} props
 */
export default function TransactionList({ transactions = [] }) {
	if (transactions.length === 0) {
		return (
			<p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-8 text-center text-sm text-slate-500">
				Sin movimientos todavía.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-slate-800">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
						<th className="px-4 py-2 font-medium">Fecha</th>
						<th className="px-4 py-2 font-medium">Descripción</th>
						<th className="px-4 py-2 font-medium">Categoría</th>
						<th className="px-4 py-2 text-right font-medium">Monto</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-800">
					{transactions.map((tx) => {
						const isIngreso = tx.transaction_type === "ingreso";
						return (
							<tr key={tx.id}>
								<td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
									{formatDate(tx.effective_date)}
								</td>
								<td className="max-w-[16rem] truncate px-4 py-2.5 text-slate-100">
									{tx.description || tx.label || "—"}
								</td>
								<td className="max-w-[10rem] truncate px-4 py-2.5 text-slate-400">
									{tx.category_id}
								</td>
								<td
									className={`px-4 py-2.5 text-right font-mono tabular-nums ${
										isIngreso ? "text-emerald-400" : "text-rose-400"
									}`}
								>
									{formatCents(tx.amount_cents)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
