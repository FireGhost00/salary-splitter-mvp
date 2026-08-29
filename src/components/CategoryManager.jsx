import { useState } from "react";
import { formatCents } from "../lib/money";

const MACRO_OPTIONS = [
	{ value: "estandar", label: "Estándar" },
	{ value: "provision", label: "Provisión" },
	{ value: "deuda", label: "Deuda" },
];

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelText = "text-xs uppercase tracking-wider text-slate-400";

/**
 * Administrador de categorías dinámicas (Modo Oscuro). Formulario para crear
 * (nombre + macro_type + target_amount si es deuda/provisión) y lista de las
 * categorías existentes con opción a eliminarlas. Todo vía /api/categories.
 *
 * @param {{ categories?: { name: string, macro_type?: string, target_amount?: number }[] }} props
 */
export default function CategoryManager({ categories = [] }) {
	const [list, setList] = useState(categories);
	const [name, setName] = useState("");
	const [macroType, setMacroType] = useState("estandar");
	const [targetText, setTargetText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	const needsTarget = macroType === "deuda" || macroType === "provision";

	async function handleAdd(event) {
		event.preventDefault();
		if (busy) return;

		const trimmed = name.trim();
		if (!trimmed) {
			setError("Escribe un nombre.");
			return;
		}
		const targetCents = needsTarget
			? Math.round((Number(targetText) || 0) * 100)
			: 0;
		if (needsTarget && !(targetCents > 0)) {
			setError("Indica el monto.");
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/categories", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: trimmed,
					macro_type: macroType,
					target_amount: targetCents,
				}),
			});
			const payload = await response.json().catch(() => ({}));

			if (response.ok) {
				setList((prev) => [
					...prev,
					payload.category ?? {
						name: trimmed,
						macro_type: macroType,
						target_amount: targetCents,
					},
				]);
				setName("");
				setTargetText("");
				setMacroType("estandar");
			} else {
				setError(payload.error ?? `Error ${response.status}.`);
			}
		} catch {
			setError("No se pudo conectar con el servidor.");
		} finally {
			setBusy(false);
		}
	}

	async function handleDelete(catName) {
		if (busy) return;
		if (!window.confirm(`¿Eliminar la categoría "${catName}"?`)) return;

		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/categories", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: catName }),
			});

			if (response.ok) {
				setList((prev) => prev.filter((c) => c.name !== catName));
			} else {
				const payload = await response.json().catch(() => ({}));
				setError(payload.error ?? `Error ${response.status}.`);
			}
		} catch {
			setError("No se pudo conectar con el servidor.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-4">
			<form
				onSubmit={handleAdd}
				className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-5"
			>
				<label className="block space-y-1">
					<span className={labelText}>Nombre</span>
					<input
						type="text"
						value={name}
						onChange={(e) => {
							setError(null);
							setName(e.target.value);
						}}
						placeholder="Ej. Renta, Netflix, Tarjeta BBVA…"
						className={inputClass}
					/>
				</label>

				<label className="block space-y-1">
					<span className={labelText}>Tipo</span>
					<select
						value={macroType}
						onChange={(e) => {
							setError(null);
							setMacroType(e.target.value);
						}}
						className={inputClass}
					>
						{MACRO_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>

				{needsTarget && (
					<label className="block space-y-1">
						<span className={labelText}>
							{macroType === "deuda" ? "Monto adeudado" : "Provisión / mes"}
						</span>
						<input
							type="number"
							inputMode="decimal"
							step="0.01"
							min="0"
							value={targetText}
							onChange={(e) => {
								setError(null);
								setTargetText(e.target.value);
							}}
							placeholder="0.00"
							className={`${inputClass} font-mono`}
						/>
					</label>
				)}

				{error && <p className="text-xs text-rose-400">{error}</p>}

				<button
					type="submit"
					disabled={busy}
					className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{busy ? "Guardando…" : "Agregar categoría"}
				</button>
			</form>

			{list.length > 0 ? (
				<ul className="divide-y divide-slate-700 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
					{list.map((cat) => {
						const withTarget =
							(cat.macro_type === "deuda" ||
								cat.macro_type === "provision") &&
							Number(cat.target_amount) > 0;
						return (
							<li
								key={cat.name}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<div className="min-w-0">
									<p className="truncate text-sm text-slate-100">{cat.name}</p>
									<p className="truncate text-xs text-slate-400">
										{cat.macro_type || "estandar"}
										{withTarget
											? ` · ${formatCents(Number(cat.target_amount))}`
											: ""}
									</p>
								</div>
								<button
									type="button"
									onClick={() => handleDelete(cat.name)}
									disabled={busy}
									aria-label={`Eliminar ${cat.name}`}
									className="shrink-0 text-slate-400 transition-colors hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
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
							</li>
						);
					})}
				</ul>
			) : (
				<p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-6 text-center text-sm text-slate-400">
					Aún no tienes categorías. Crea la primera arriba.
				</p>
			)}
		</div>
	);
}
