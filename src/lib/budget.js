/**
 * Modelo de presupuesto 50/30/20 (fijo, NO editable por el usuario).
 *
 * - Necesidad 50 %, Deseo 30 %, Ahorro 20 %.
 * - "Deuda" (pago mensual fijo) y "Provisión Mensual" (rubros anuales / 12) se
 *   absorben DENTRO del 50 % de Necesidad.
 * - Si Deuda + Provisión Mensual superan el 50 % del ingreso => déficit.
 *
 * En esta rama `transactions.category_id` guarda el NOMBRE de la categoría
 * (igual que la vista monthly_balances, DashboardCharts y DebtTracker), así que
 * el motor cruza por nombre y no por UUID.
 */

/** Reparto maestro inamovible. Suma 100. */
export const MASTER_SPLIT = Object.freeze({
	necesidad: 50,
	deseo: 30,
	ahorro: 20,
});

/** Nombres canónicos de las categorías del sistema. */
export const SYS_CAT = Object.freeze({
	necesidad: "Necesidad",
	deseo: "Deseo",
	ahorro: "Ahorro",
	deuda: "Deuda",
	provision: "Provisiones",
});

/**
 * Las 3 categorías maestras, siempre presentes. `macro_type: "estandar"` (el
 * reparto 50/30/20 lo hace el motor por NOMBRE, no por macro_type).
 */
export const CORE_CATEGORIES = Object.freeze([
	{ name: SYS_CAT.necesidad, macro_type: "estandar" },
	{ name: SYS_CAT.deseo, macro_type: "estandar" },
	{ name: SYS_CAT.ahorro, macro_type: "estandar" },
]);

/** Categorías opcionales: se siembran al habilitarse en el panel. */
export const OPTIONAL_CATEGORIES = Object.freeze([
	{ name: SYS_CAT.deuda, macro_type: "deuda" },
	{ name: SYS_CAT.provision, macro_type: "provision" },
]);

/**
 * Subcategorías: filas de `categories` cuyo `macro_type` apunta a un master.
 * El gasto contra una subcategoría descuenta del sobre master (category_id) y
 * guarda el nombre de la subcategoría en `transactions.subcategory`.
 */
export const SUBCATEGORY_MACROS = Object.freeze(["necesidad", "deseo", "ahorro"]);

/** Diccionario base de subcategorías que se siembra en el onboarding. */
export const BASE_SUBCATEGORIES = Object.freeze([
	{ name: "Alquiler", macro_type: "necesidad" },
	{ name: "Educación", macro_type: "necesidad" },
	{ name: "Supermercado", macro_type: "necesidad" },
	{ name: "Servicios (Luz/Agua)", macro_type: "necesidad" },
	{ name: "Restaurantes", macro_type: "deseo" },
	{ name: "Entretenimiento", macro_type: "deseo" },
	{ name: "Suscripciones", macro_type: "deseo" },
	{ name: "Fondo de Emergencia", macro_type: "ahorro" },
	{ name: "Inversiones", macro_type: "ahorro" },
]);

const PARENT_MASTER_BY_MACRO = Object.freeze({
	necesidad: SYS_CAT.necesidad,
	deseo: SYS_CAT.deseo,
	ahorro: SYS_CAT.ahorro,
});

const SYS_NAMES = new Set(Object.values(SYS_CAT));

/** Nombre del master padre para un macro_type de subcategoría, o null. */
export function parentMasterOf(macroType) {
	return PARENT_MASTER_BY_MACRO[macroType] ?? null;
}

/** ¿Esta fila de `categories` es una subcategoría (no una del sistema)? */
export function isSubcategory(row) {
	return (
		parentMasterOf(row?.macro_type) != null && !SYS_NAMES.has(row?.name)
	);
}

/** Suma de rubros anuales / 12, en centavos enteros (CONVENCIONES.md §2). */
export function monthlyProvisionCents(items = []) {
	const annual = items.reduce(
		(sum, it) =>
			sum + Math.max(0, Math.round(Number(it?.annual_amount_cents) || 0)),
		0,
	);
	return Math.round(annual / 12);
}

/**
 * Reparte un ingreso (centavos enteros) en el modelo 50/30/20 con Deuda y
 * Provisión Mensual absorbidas dentro de Necesidad.
 *
 * @param {number} incomeCents
 * @param {{ debtCents?: number, provisionCents?: number }} fixed
 * @returns {{
 *   deficit: boolean,
 *   income_cents: number,
 *   shares: { necesidad: number, deseo: number, ahorro: number },
 *   fixed: { debt_cents: number, provision_cents: number, total_cents: number },
 *   necesidad_free_cents: number,
 *   over_cents: number,
 * }}
 */
export function splitIncome(incomeCents, { debtCents = 0, provisionCents = 0 } = {}) {
	const income = Math.max(0, Math.round(Number(incomeCents) || 0));

	// Multiplicación sobre enteros + floor explícito (§2).
	const necesidad = Math.floor((income * MASTER_SPLIT.necesidad) / 100);
	const deseo = Math.floor((income * MASTER_SPLIT.deseo) / 100);
	// El residuo del floor se suma a Ahorro para cuadrar exacto con el ingreso.
	const ahorro = income - necesidad - deseo;

	const debt = Math.max(0, Math.round(Number(debtCents) || 0));
	const provision = Math.max(0, Math.round(Number(provisionCents) || 0));
	const fixedTotal = debt + provision;

	const deficit = fixedTotal > necesidad;

	return {
		deficit,
		income_cents: income,
		shares: { necesidad, deseo, ahorro },
		fixed: {
			debt_cents: debt,
			provision_cents: provision,
			total_cents: fixedTotal,
		},
		necesidad_free_cents: deficit ? 0 : necesidad - fixedTotal,
		over_cents: deficit ? fixedTotal - necesidad : 0,
	};
}
