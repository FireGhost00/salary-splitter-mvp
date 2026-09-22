import { useMemo, useState } from "react";

const MASTERS = [
	{ macro: "necesidad", label: "Necesidad" },
	{ macro: "deseo", label: "Deseo" },
	{ macro: "ahorro", label: "Ahorro" },
];

const inputClass =
	"w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const iconBtnClass =
	"text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Lápiz (editar). */
function PencilIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-3 w-3"
			aria-hidden="true"
		>
			<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
			<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
		</svg>
	);
}

/** Papelera (eliminar), mismo trazo que TransactionList.jsx. */
function TrashIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-3 w-3"
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
 * "Mis Categorías": lista las subcategorías del usuario agrupadas por master
 * (Necesidad/Deseo/Ahorro), permite añadir, renombrar (inline) y eliminar
 * (con confirmación) cada una. Los encabezados de master NUNCA son editables
 * ni eliminables -- `categories` ya llega pre-filtrado a solo subcategorías
 * (ver configuracion.astro, isSubcategory()).
 *
 * Guarda en POST /api/add-category, POST /api/rename-category y
 * DELETE /api/delete-category.
 *
 * @param {{ categories?: { name: string, macro_type: string }[] }} props
 */
export default function MyCategories({ categories = [] }) {
	const [rows, setRows] = useState(categories);
	const [name, setName] = useState("");
	const [macro, setMacro] = useState("necesidad");
	const [isSaving, setIsSaving] = useState(false);
	const [feedback, setFeedback] = useState(null);

	// --- Edición inline (renombrar) ---------------------------------------
	const [editingName, setEditingName] = useState(null);
	const [editValue, setEditValue] = useState("");
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameError, setRenameError] = useState(null);

	// --- Borrado con modal de confirmación (no confirm() nativo) -----------
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState(null);

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

	function startEdit(currentName) {
		setEditingName(currentName);
		setEditValue(currentName);
		setRenameError(null);
	}

	function cancelEdit() {
		setEditingName(null);
		setEditValue("");
		setRenameError(null);
	}

	async function confirmRename(oldName) {
		if (isRenaming) return;
		const clean = editValue.trim();
		if (!clean) {
			setRenameError("Escribe un nombre.");
			return;
		}
		if (clean === oldName) {
			cancelEdit();
			return;
		}
		if (
			rows.some(
				(r) => r.name !== oldName && r.name.toLowerCase() === clean.toLowerCase(),
			)
		) {
			setRenameError("Ya existe una categoría con ese nombre.");
			return;
		}

		setIsRenaming(true);
		setRenameError(null);
		try {
			const response = await fetch("/api/rename-category", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: oldName, new_name: clean }),
			});
			const payload = await response.json().catch(() => ({}));
			if (response.ok) {
				setRows((prev) =>
					prev.map((r) => (r.name === oldName ? { ...r, name: clean } : r)),
				);
				cancelEdit();
			} else {
				setRenameError(payload.error ?? `Error ${response.status}.`);
			}
		} catch {
			setRenameError("No se pudo conectar con el servidor.");
		} finally {
			setIsRenaming(false);
		}
	}

	function requestDelete(catName) {
		setDeleteError(null);
		setDeleteTarget(catName);
	}

	async function confirmDeleteCategory() {
		if (isDeleting || !deleteTarget) return;
		const targetName = deleteTarget;
		setIsDeleting(true);
		setDeleteError(null);
		try {
			const response = await fetch("/api/delete-category", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: targetName }),
			});
			if (response.ok) {
				setRows((prev) => prev.filter((r) => r.name !== targetName));
				setDeleteTarget(null);
			} else {
				const payload = await response.json().catch(() => ({}));
				setDeleteError(payload.error ?? `Error ${response.status}.`);
			}
		} catch {
			setDeleteError("No se pudo conectar con el servidor.");
		} finally {
			setIsDeleting(false);
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
										className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 py-1 pl-2.5 pr-1.5 text-xs text-slate-300"
									>
										{editingName === it.name ? (
											<>
												<input
													autoFocus
													type="text"
													value={editValue}
													onChange={(e) => setEditValue(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") confirmRename(it.name);
														if (e.key === "Escape") cancelEdit();
													}}
													disabled={isRenaming}
													className="w-28 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
												/>
												<button
													type="button"
													onClick={() => confirmRename(it.name)}
													disabled={isRenaming}
													aria-label={`Guardar nombre de ${it.name}`}
													className={`${iconBtnClass} hover:text-emerald-400`}
												>
													✓
												</button>
												<button
													type="button"
													onClick={cancelEdit}
													disabled={isRenaming}
													aria-label="Cancelar edición"
													className={`${iconBtnClass} hover:text-slate-300`}
												>
													✕
												</button>
											</>
										) : (
											<>
												<span className="max-w-[10rem] truncate">{it.name}</span>
												<button
													type="button"
													onClick={() => startEdit(it.name)}
													aria-label={`Renombrar ${it.name}`}
													className={`${iconBtnClass} hover:text-indigo-400`}
												>
													<PencilIcon />
												</button>
												<button
													type="button"
													onClick={() => requestDelete(it.name)}
													aria-label={`Eliminar ${it.name}`}
													className={`${iconBtnClass} hover:text-rose-400`}
												>
													<TrashIcon />
												</button>
											</>
										)}
									</li>
								))}
								{editingName &&
									renameError &&
									g.items.some((it) => it.name === editingName) && (
										<li className="basis-full text-[10px] text-rose-400">
											{renameError}
										</li>
									)}
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

			{deleteTarget && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="mx-4 max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6">
						<p className="text-sm font-semibold text-slate-100">
							¿Eliminar &ldquo;{deleteTarget}&rdquo;?
						</p>
						<p className="mt-2 text-xs text-slate-400">
							Las transacciones que ya registraste con esta subcategoría
							conservan la etiqueta &ldquo;{deleteTarget}&rdquo; en el
							Historial; no se modifican ni se borran.
						</p>
						{deleteError && (
							<p className="mt-2 text-xs text-rose-400">{deleteError}</p>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setDeleteTarget(null)}
								disabled={isDeleting}
								className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Cancelar
							</button>
							<button
								type="button"
								onClick={confirmDeleteCategory}
								disabled={isDeleting}
								className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isDeleting ? "Eliminando…" : "Sí, eliminar"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
