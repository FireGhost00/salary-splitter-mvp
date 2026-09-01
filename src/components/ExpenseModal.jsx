import { useEffect, useMemo, useState } from "react";
import { formatCents } from "../lib/money";

/** Fecha local de hoy como YYYY-MM-DD (valor por defecto del selector). */
function todayISO() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Masters en orden; cada uno agrupa sus subcategorías en el <select>. */
const MASTER_NAMES = ["Necesidad", "Deseo", "Ahorro"];

const SUB_PREFIX = "sub:";
const PI_PREFIX = "pi:";
const isSubValue = (v) => typeof v === "string" && v.startsWith(SUB_PREFIX);
const isPiValue = (v) => typeof v === "string" && v.startsWith(PI_PREFIX);

/**
 * Modal de Gasto Rápido (Modo Oscuro).
 *
 * El <select> agrupa por master (Necesidad / Deseo / Ahorro), cada uno con la
 * opción "general" + sus subcategorías. Un gasto contra una subcategoría
 * descuenta del sobre master (category_id = master) y guarda el nombre en
 * `transactions.subcategory`. Deuda y los rubros de Provisión van aparte.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   categories?: { id: string, name: string, macro_type?: string, availableCents?: number }[],
 *   provisionItems?: { id: string, label: string, availableCents?: number }[],
 *   subcategories?: { name: string, parentMaster: string }[],
 * }} props
 */
export default function ExpenseModal({
	open,
	onClose,
	categories = [],
	provisionItems = [],
	subcategories = [],
}) {
	// Se oculta la categoría agregada "Provisiones": se gasta por rubro.
	const selectable = useMemo(
		() => categories.filter((c) => c.name !== "Provisiones"),
		[categories],
	);
	const nonMaster = useMemo(
		() => selectable.filter((c) => !MASTER_NAMES.includes(c.name)),
		[selectable],
	);

	const [selection, setSelection] = useState("");
	const [amountText, setAmountText] = useState("");
	const [concept, setConcept] = useState("");
	const [effectiveDate, setEffectiveDate] = useState(todayISO());
	const [fallbackId, setFallbackId] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState(null);

	const selectedSub = isSubValue(selection)
		? subcategories.find((s) => s.name === selection.slice(SUB_PREFIX.length))
		: null;
	const selectedProvisionItem = isPiValue(selection)
		? provisionItems.find((p) => p.id === selection.slice(PI_PREFIX.length))
		: null;
	const selectedCategory =
		!selectedSub && !selectedProvisionItem
			? categories.find((c) => c.id === selection)
			: null;

	// Categoría real contra la que se descuenta (master si es subcategoría).
	const primaryName = selectedSub
		? selectedSub.parentMaster
		: (selectedProvisionItem ? "Provisiones" : selectedCategory?.name ?? "");
	const primaryCategory = categories.find((c) => c.name === primaryName);

	const displayName = selectedSub
		? `${selectedSub.name} · ${selectedSub.parentMaster}`
		: (selectedProvisionItem?.label ?? selectedCategory?.name ?? "");

	const availableCents = selectedProvisionItem
		? Number(selectedProvisionItem.availableCents ?? 0)
		: typeof primaryCategory?.availableCents === "number"
			? primaryCategory.availableCents
			: null;

	const parsedAmount = Number.parseFloat(amountText);
	const amountCents =
		Number.isFinite(parsedAmount) && parsedAmount > 0
			? Math.round(parsedAmount * 100)
			: 0;
	const isOverdraft =
		availableCents != null && amountCents > 0 && amountCents > availableCents;
	const shortfallCents = isOverdraft ? amountCents - availableCents : 0;

	// Respaldo del sobregiro: cualquier sobre (master o rubro de provisión) con
	// saldo > 0, excepto el sobre del gasto principal.
	const primaryFallbackKey = selectedProvisionItem
		? `${PI_PREFIX}${selectedProvisionItem.id}`
		: primaryName;

	const fallbackOptions = [
		...categories
			.filter(
				(c) =>
					MASTER_NAMES.includes(c.name) &&
					typeof c.availableCents === "number" &&
					c.availableCents > 0 &&
					c.name !== primaryFallbackKey,
			)
			.map((c) => ({
				value: c.name,
				label: `${c.name} — ${formatCents(c.availableCents)}`,
			})),
		...provisionItems
			.filter(
				(it) =>
					Number(it.availableCents ?? 0) > 0 &&
					`${PI_PREFIX}${it.id}` !== primaryFallbackKey,
			)
			.map((it) => ({
				value: `${PI_PREFIX}${it.id}`,
				label: `${it.label} — ${formatCents(Number(it.availableCents ?? 0))}`,
			})),
	];

	const effectiveFallback =
		fallbackId && fallbackOptions.some((o) => o.value === fallbackId)
			? fallbackId
			: (fallbackOptions[0]?.value ?? "");

	useEffect(() => {
		if (!open) return;
		setSelection((prev) => prev || selectable[0]?.id || "");
		setError(null);
	}, [open, selectable]);

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
		setEffectiveDate(todayISO());
		setFallbackId("");
		setError(null);
		onClose();
	}

	async function handleSubmit(event) {
		event.preventDefault();
		if (isSubmitting) return;

		if (amountCents <= 0) {
			setError("Introduce un monto mayor que 0.");
			return;
		}
		if (!selection) {
			setError("Elige una categoría.");
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
			setError("Selecciona una fecha válida.");
			return;
		}
		if (isOverdraft && !effectiveFallback) {
			setError("Elige un sobre con saldo para cubrir el faltante.");
			return;
		}

		const body = {
			amount_cents: amountCents,
			description: concept.trim(),
			effective_date: effectiveDate,
		};
		if (selectedSub) {
			body.category_id = selectedSub.parentMaster;
			body.subcategory = selectedSub.name;
			body.label = selectedSub.name;
		} else if (selectedProvisionItem) {
			body.category_id = "Provisiones";
			body.provision_item_id = selectedProvisionItem.id;
			body.label = selectedProvisionItem.label;
		} else {
			body.category_id = selection;
			body.label = selectedCategory?.name ?? selection;
		}
		if (isOverdraft) {
			if (effectiveFallback.startsWith(PI_PREFIX)) {
				body.fallback_provision_item_id = effectiveFallback.slice(
					PI_PREFIX.length,
				);
			} else {
				body.fallback_category_id = effectiveFallback;
			}
		}

		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch("/api/expense", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (response.status === 200) {
				resetAndClose();
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
							Fecha
						</span>
						<input
							type="date"
							required
							value={effectiveDate}
							onChange={(event) => setEffectiveDate(event.target.value)}
							className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						/>
					</label>

					<label className="block space-y-1">
						<span className="text-xs uppercase tracking-wider text-slate-400">
							Categoría
						</span>
						<select
							value={selection}
							onChange={(event) => setSelection(event.target.value)}
							required
							className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
						>
							{selectable.length === 0 && provisionItems.length === 0 && (
								<option value="">Sin categorías</option>
							)}

							{MASTER_NAMES.filter((m) =>
								selectable.some((c) => c.name === m),
							).map((master) => (
								<optgroup
									key={master}
									label={master}
									className="bg-slate-900 text-slate-400"
								>
									<option
										value={master}
										className="bg-slate-900 text-slate-100"
									>
										{master} (general)
									</option>
									{subcategories
										.filter((s) => s.parentMaster === master)
										.map((s) => (
											<option
												key={s.name}
												value={`${SUB_PREFIX}${s.name}`}
												className="bg-slate-900 text-slate-100"
											>
												{s.name}
											</option>
										))}
								</optgroup>
							))}

							{nonMaster.length > 0 && (
								<optgroup
									label="Deudas / otras"
									className="bg-slate-900 text-slate-400"
								>
									{nonMaster.map((c) => (
										<option
											key={c.id}
											value={c.id}
											className="bg-slate-900 text-slate-100"
										>
											{c.name}
										</option>
									))}
								</optgroup>
							)}

							{provisionItems.length > 0 && (
								<optgroup
									label="Provisiones"
									className="bg-slate-900 text-slate-400"
								>
									{provisionItems.map((item) => (
										<option
											key={item.id}
											value={`${PI_PREFIX}${item.id}`}
											className="bg-slate-900 text-slate-100"
										>
											{item.label}
										</option>
									))}
								</optgroup>
							)}
						</select>
						{displayName && availableCents != null && (
							<p className="text-xs text-slate-400">
								{displayName} — Disponible:{" "}
								<span
									className={`font-mono ${
										availableCents < 0 ? "text-rose-400" : "text-emerald-400"
									}`}
								>
									{formatCents(availableCents)}
								</span>
							</p>
						)}
					</label>

					{isOverdraft && (
						<div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-950/30 p-3">
							<p className="text-xs text-amber-300">
								Este gasto supera el saldo disponible. Faltan{" "}
								<span className="font-mono">{formatCents(shortfallCents)}</span>.
							</p>
							{fallbackOptions.length > 0 ? (
								<label className="block space-y-1">
									<span className="text-[11px] uppercase tracking-wider text-amber-400/80">
										Cubrir el faltante desde
									</span>
									<select
										value={effectiveFallback}
										onChange={(event) => setFallbackId(event.target.value)}
										className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
									>
										{fallbackOptions.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</label>
							) : (
								<p className="text-[11px] text-amber-400/80">
									No hay ningún sobre con saldo disponible para cubrirlo.
								</p>
							)}
						</div>
					)}

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
