import { useMemo, useState } from "react";

const MASTERS = [
	{ macro: "necesidad", label: "Necesidad" },
	{ macro: "deseo", label: "Deseo" },
	{ macro: "ahorro", label: "Ahorro" },
];

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/**
 * "Mis Categorías": lista las subcategorías del usuario agrupadas por master y
 * permite añadir nuevas (nombre + master). Guarda en POST /api/add-category.
 *
 * @param {{ categories?: { name: string, macro_type: string }[] }} props
 */
export default function MyCategories({ categories = [] }) {
	const [rows, setRows] = useState(categories);
	const [name, setName] = useState("");
	const [macro, setMacro] = useState("necesidad");
	const [isSaving, setIsSaving] = useState(false);
	const [feedback, setFeedback] = useState(null);

	const grouped = useMemo(() => {
		return MASTERS.map((m) => ({
			...m,
			items: rows.filter((r) => r.macro_type === m.macro),
		}));
	}, [rows]);

	async function handleAdd(event) {
		event.preventDefault();
		if (isSaving) return;

		const clean = name.trim();
		if (!clean) {
			setFeedback({ type: "error", text: "Escribe un nombre." });
			return;
		}
		if (rows.some((r) => r.name.toLowerCase() === clean.toLowerCase())) {
			setFeedback({ type: "error", text: "Ya existe una categoría con ese nombre." });
			return;
		}

		setIsSaving(true);
		setFeedback(null);
		try {
			const response = await fetch("/api/add-category", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: clean, macro_type: macro }),
			});
			const payload = await response.json().catch(() => ({}));
			if (response.ok) {
				setRows((prev) => [...prev, { name: clean, macro_type: macro }]);
				setName("");
				setFeedback({ type: "ok", text: "Categoría añadida." });
			} else {
				setFeedback({
					type: "error",
					text: payload.error ?? `Error ${response.status}.`,
				});
			}
		} catch {
			setFeedback({ type: "error", text: "No se pudo conectar con el servidor." });
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
			<div className="space-y-3">
				{grouped.map((g) => (
					<div key={g.macro}>
						<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
							{g.label}
						</p>
						{g.items.length > 0 ? (
							<ul className="mt-1 flex flex-wrap gap-1.5">
								{g.items.map((it) => (
									<li
										key={it.name}
										className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300"
									>
										{it.name}
									</li>
								))}
							</ul>
						) : (
							<p className="mt-1 text-xs text-slate-600">Sin subcategorías.</p>
						)}
					</div>
				))}
			</div>

			<form
				onSubmit={handleAdd}
				className="flex flex-wrap items-end gap-2 border-t border-slate-700 pt-4"
			>
				<label className="min-w-[8rem] flex-1 space-y-1">
					<span className="text-[11px] uppercase tracking-wider text-slate-400">
						Nueva categoría
					</span>
					<input
						type="text"
						value={name}
						onChange={(e) => {
							setFeedback(null);
							setName(e.target.value);
						}}
						placeholder="Ej. Mascotas"
						className={inputClass}
					/>
				</label>
				<label className="space-y-1">
					<span className="text-[11px] uppercase tracking-wider text-slate-400">
						Pertenece a
					</span>
					<select
						value={macro}
						onChange={(e) => setMacro(e.target.value)}
						className={`${inputClass} w-36`}
					>
						{MASTERS.map((m) => (
							<option key={m.macro} value={m.macro}>
								{m.label}
							</option>
						))}
					</select>
				</label>
				<button
					type="submit"
					disabled={isSaving}
					className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
				>
					+ Agregar
				</button>
			</form>

			{feedback && (
				<p
					className={`text-xs ${
						feedback.type === "ok" ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{feedback.text}
				</p>
			)}
		</div>
	);
}
