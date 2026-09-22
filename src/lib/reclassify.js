import { useState } from "react";

/** Orden estable para el <select> de sobre; solo estos 3 son reclasificables. */
export const MASTER_ORDER = ["Necesidad", "Deseo", "Ahorro"];

/**
 * Los 3 sobres reclasificables presentes para este usuario (macro_type
 * "estandar" -> Necesidad/Deseo/Ahorro; Deuda/Provisiones nunca lo son, ver
 * src/lib/budget.js), en un orden estable.
 *
 * @param {{ name: string, macro_type?: string }[]} categories
 * @returns {string[]}
 */
export function deriveMasterNames(categories = []) {
	const present = new Set(
		categories.filter((c) => c.macro_type === "estandar").map((c) => c.name),
	);
	return MASTER_ORDER.filter((name) => present.has(name));
}

/**
 * Nombres de subcategoría disponibles por sobre maestro (parentMaster). Solo
 * Necesidad/Deseo/Ahorro tienen entradas aquí.
 *
 * @param {{ name: string, parentMaster: string }[]} subcategories
 * @returns {Record<string, string[]>}
 */
export function deriveSubcategoriesByMaster(subcategories = []) {
	const map = {};
	for (const s of subcategories) {
		if (!s?.parentMaster || !s?.name) continue;
		(map[s.parentMaster] ??= []).push(s.name);
	}
	return map;
}

/**
 * ¿Esta fila puede reclasificarse? Mismo criterio en Dashboard e Historial:
 * un gasto contra uno de los 3 sobres maestros (nunca Deuda/Provisiones).
 *
 * @param {{ transaction_type: string, category_id: string | null }} tx
 * @param {string[]} masterNames
 */
export function isReclassifiableExpense(tx, masterNames) {
	return tx.transaction_type === "gasto" && masterNames.includes(tx.category_id);
}

/**
 * Hook compartido (TransactionList.jsx / TransactionHistory.jsx): guardado
 * inmediato de `category_id` y/o `subcategory` contra
 * PATCH /api/reclassify-transaction, sin recargar la página. `setRows` es el
 * setState del array plano de transacciones de quien lo use; se actualiza la
 * fila afectada con la respuesta del servidor (fuente de verdad).
 *
 * @param {(updater: (prev: any[]) => any[]) => void} setRows
 */
export function useReclassifyTransaction(setRows) {
	const [savingRowId, setSavingRowId] = useState(null);
	const [rowErrors, setRowErrors] = useState({});

	/**
	 * @param {number} id
	 * @param {{ category_id?: string, subcategory?: string | null }} patch
	 */
	async function reclassify(id, patch) {
		if (savingRowId != null) return;
		setSavingRowId(id);
		setRowErrors((prev) => ({ ...prev, [id]: null }));
		try {
			const response = await fetch("/api/reclassify-transaction", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id, ...patch }),
			});
			const payload = await response.json().catch(() => ({}));
			if (response.ok) {
				setRows((prev) =>
					prev.map((tx) =>
						tx.id === id
							? {
									...tx,
									category_id: payload.transaction?.category_id ?? tx.category_id,
									subcategory: payload.transaction?.subcategory ?? null,
								}
							: tx,
					),
				);
			} else {
				setRowErrors((prev) => ({
					...prev,
					[id]: payload.error ?? `Error ${response.status}.`,
				}));
			}
		} catch {
			setRowErrors((prev) => ({
				...prev,
				[id]: "No se pudo conectar con el servidor.",
			}));
		} finally {
			setSavingRowId(null);
		}
	}

	return { reclassify, savingRowId, rowErrors };
}
