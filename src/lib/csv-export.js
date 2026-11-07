/**
 * Exportación de movimientos a CSV (para Excel / análisis externo).
 *
 * Módulo PURO: sin Supabase ni Astro, todo testeable en tests/csv-export.test.js.
 * Lo consume GET /api/export-transactions.
 *
 * Decisiones de formato:
 *  - UTF-8 con BOM: sin él, Excel en Windows abre el archivo como ANSI y rompe
 *    tildes y eñes ("Alimentación", "Educación").
 *  - Separador coma y fin de línea CRLF (RFC 4180).
 *  - Montos como decimal con punto ("-17.50"), sin separador de miles, a partir
 *    del entero de centavos con aritmética entera (Patrón Money, CONVENCIONES.md
 *    §2): nunca se divide entre 100 en float.
 *  - Protección contra inyección de fórmulas: un campo de TEXTO que empieza con
 *    =, +, - o @ se prefija con un apóstrofo, para que Excel lo muestre como
 *    texto y no lo evalúe. La columna `monto` nunca se toca (un "-17.00" debe
 *    seguir siendo un número).
 */

import { SYS_CAT } from "./budget.js";
import { MIN_YEAR } from "./period.js";

/** Byte Order Mark de UTF-8. */
export const UTF8_BOM = "﻿";

/** Fin de línea de cada registro (RFC 4180). */
export const CRLF = "\r\n";

/** Columnas del CSV, en orden. */
export const CSV_COLUMNS = Object.freeze([
	"fecha",
	"mes",
	"tipo",
	"sobre",
	"grupo_50_30_20",
	"subcategoria",
	"rubro_provision",
	"concepto",
	"monto",
	"grupo_ingreso",
]);

/**
 * Entero de centavos -> string decimal con 2 decimales y punto.
 *   1700 -> "17.00", -1700 -> "-17.00", 5 -> "0.05", -5 -> "-0.05", 0 -> "0.00".
 * Solo aritmética entera: `%` y una división exacta (de un múltiplo de 100).
 * Lanza TypeError si `cents` no es un entero seguro (no se "arregla" un float).
 */
export function centsToDecimalString(cents) {
	if (typeof cents !== "number" || !Number.isSafeInteger(cents)) {
		throw new TypeError(
			`centsToDecimalString: se esperaba un entero de centavos, llegó ${String(cents)}`,
		);
	}
	const negative = cents < 0;
	const abs = negative ? -cents : cents;
	const fraction = abs % 100;
	const whole = (abs - fraction) / 100;
	return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}

const NEEDS_QUOTES_RE = /[",\r\n]/;
const FORMULA_START_RE = /^[=+\-@]/;

/**
 * Escapa un valor para una celda CSV.
 *  - null / undefined -> "".
 *  - `formulaGuard` (true por defecto, para campos de TEXTO): si empieza con
 *    =, +, - o @ se antepone un apóstrofo. Pasar `{ formulaGuard: false }`
 *    SOLO para la columna monto.
 *  - Si contiene coma, comilla doble, CR o LF, se envuelve en comillas dobles y
 *    las comillas internas se duplican.
 */
export function escapeCsvField(value, { formulaGuard = true } = {}) {
	if (value === null || value === undefined) return "";
	let s = String(value);
	if (formulaGuard && FORMULA_START_RE.test(s)) s = `'${s}`;
	if (NEEDS_QUOTES_RE.test(s)) s = `"${s.replace(/"/g, '""')}"`;
	return s;
}

/** Sobre (nombre canónico) -> grupo del modelo 50/30/20. */
const GROUP_BY_CATEGORY = new Map([
	[SYS_CAT.necesidad, "Necesidad"],
	[SYS_CAT.deuda, "Necesidad"],
	[SYS_CAT.provision, "Necesidad"],
	[SYS_CAT.deseo, "Deseo"],
	[SYS_CAT.ahorro, "Ahorro"],
]);

/**
 * Grupo 50/30/20 de un sobre. Deuda y Provisiones viven DENTRO del 50 % de
 * Necesidad (ver budget.js), así que cuentan como "Necesidad". Cualquier otro
 * nombre (categorías heredadas, etc.) -> "Otro".
 */
export function groupFor503020(categoryId) {
	return GROUP_BY_CATEGORY.get(categoryId) ?? "Otro";
}

/** Busca la etiqueta de un rubro en un Map o en un objeto plano. */
function lookupLabel(provisionLabelsById, id) {
	if (id === null || id === undefined || !provisionLabelsById) return "";
	const key = String(id);
	if (provisionLabelsById instanceof Map) return provisionLabelsById.get(key) ?? "";
	return Object.prototype.hasOwnProperty.call(provisionLabelsById, key)
		? (provisionLabelsById[key] ?? "")
		: "";
}

function nonEmpty(s) {
	return typeof s === "string" && s.trim() !== "" ? s : null;
}

/**
 * Construye el CSV completo (con BOM) a partir de filas de `transactions`.
 *
 * @param {Array<{
 *   effective_date: string, transaction_type: string, category_id: string,
 *   subcategory?: string|null, provision_item_id?: string|null,
 *   description?: string|null, label?: string|null, amount_cents: number,
 *   group_id?: string|null,
 * }>} rows  Ya ordenadas como se quieren ver.
 * @param {Map<string,string> | Record<string,string>} [provisionLabelsById]
 *   id de rubro de provisión -> nombre del rubro.
 * @returns {string}
 */
export function buildTransactionsCsv(rows, provisionLabelsById = new Map()) {
	const lines = [CSV_COLUMNS.join(",")];
	for (const row of rows ?? []) {
		const fecha = String(row.effective_date ?? "").slice(0, 10);
		const cells = [
			escapeCsvField(fecha),
			escapeCsvField(fecha.slice(0, 7)),
			escapeCsvField(row.transaction_type),
			escapeCsvField(row.category_id),
			escapeCsvField(groupFor503020(row.category_id)),
			escapeCsvField(row.subcategory),
			escapeCsvField(lookupLabel(provisionLabelsById, row.provision_item_id)),
			escapeCsvField(nonEmpty(row.description) ?? row.label),
			escapeCsvField(centsToDecimalString(Number(row.amount_cents ?? 0)), {
				formulaGuard: false,
			}),
			escapeCsvField(row.group_id),
		];
		lines.push(cells.join(","));
	}
	return UTF8_BOM + lines.map((l) => l + CRLF).join("");
}

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^\d{1,2}$/;
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Valida `?year=YYYY[&month=M]` y devuelve el rango de fechas a exportar.
 * A diferencia de `resolveViewedMonth` (que cae al mes actual en silencio),
 * aquí un parámetro inválido es un error explícito: es una descarga y el
 * usuario debe recibir exactamente el período que pidió.
 *
 * @param {{ yearParam?: string|null, monthParam?: string|null, now?: Date }} params
 * @returns {{ from: string, to: string, filename: string } | { error: string }}
 *   `from` / `to`: fechas YYYY-MM-DD inclusivas para `effective_date`.
 */
export function parseExportRange({ yearParam, monthParam, now = new Date() } = {}) {
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth() + 1;

	const yearStr = yearParam == null ? "" : String(yearParam).trim();
	const monthStr = monthParam == null ? "" : String(monthParam).trim();

	if (!YEAR_RE.test(yearStr)) {
		return { error: "`year` es obligatorio y debe ser un año de 4 dígitos (YYYY)." };
	}
	const year = Number.parseInt(yearStr, 10);
	if (year < MIN_YEAR) {
		return { error: `\`year\` debe ser ${MIN_YEAR} o posterior.` };
	}
	if (year > currentYear) {
		return { error: "`year` no puede ser un año futuro." };
	}

	if (monthStr === "") {
		return {
			from: `${year}-01-01`,
			to: `${year}-12-31`,
			filename: `movimientos-${year}.csv`,
		};
	}

	if (!MONTH_RE.test(monthStr)) {
		return { error: "`month` debe ser un entero entre 1 y 12." };
	}
	const month = Number.parseInt(monthStr, 10);
	if (month < 1 || month > 12) {
		return { error: "`month` debe ser un entero entre 1 y 12." };
	}
	if (year === currentYear && month > currentMonth) {
		return { error: "`month` no puede ser un mes futuro." };
	}

	// Día 0 del mes siguiente = último día de este mes (UTC: sin desfase de zona).
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		from: `${year}-${pad2(month)}-01`,
		to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
		filename: `movimientos-${year}-${pad2(month)}.csv`,
	};
}

/**
 * Lee TODAS las filas de una consulta paginada con `.range()`.
 *
 * `fetchPage(from, to)` debe devolver `{ data, error, count }` (forma de
 * supabase-js con `{ count: "exact" }`). Se avanza por lo que REALMENTE llegó,
 * no por el tamaño pedido: si el servidor tiene un tope menor (max-rows) que
 * `pageSize`, no se pierde nada. Se para cuando se alcanzó `count` o cuando un
 * lote llega vacío.
 *
 * @returns {Promise<{ rows: any[], error: any }>}
 */
export async function fetchAllRows(fetchPage, { pageSize = 1000 } = {}) {
	const rows = [];
	let total = null;
	for (;;) {
		const { data, error, count } = await fetchPage(rows.length, rows.length + pageSize - 1);
		if (error) return { rows, error };
		if (typeof count === "number") total = count;
		const batch = data ?? [];
		rows.push(...batch);
		if (batch.length === 0) break;
		if (total !== null ? rows.length >= total : batch.length < pageSize) break;
	}
	return { rows, error: null };
}
