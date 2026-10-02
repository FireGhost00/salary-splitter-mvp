/**
 * Resolución y navegación del "mes visto" (dashboard, resumen anual) a partir
 * de `?year=&month=`. Reglas (todas aplican igual, sin casos especiales):
 *   - Falta alguno de los dos params, o no son enteros -> mes actual.
 *   - `month` fuera de 1..12 -> mes actual.
 *   - `year` no es un año de 4 dígitos ("absurdo": "1", "20260", "0", "-5") -> mes actual.
 *   - El mes resultante es futuro respecto a `now` -> mes actual (nunca se
 *     muestra un mes que todavía no existe).
 *   - Si no cae en ninguno de los anteriores, es un mes pasado válido -> ese mes.
 */

export const MONTH_NAMES_ES = Object.freeze([
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]);

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^\d{1,2}$/;
/** Piso de cordura para `year` ("0000" son 4 dígitos pero no es un año real). */
const MIN_YEAR = 1970;

/** Mes anterior (1..12), con acarreo de año (enero -> diciembre del año previo). */
function previousMonth(year, month) {
	return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Mes siguiente (1..12), con acarreo de año (diciembre -> enero del año próximo). */
function nextMonth(year, month) {
	return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Resuelve el mes a mostrar a partir de los query params crudos (strings de
 * `URLSearchParams.get()`, o `null`/`undefined` si no vienen) y la fecha
 * actual (inyectable para pruebas).
 *
 * @param {{
 *   yearParam?: string | null,
 *   monthParam?: string | null,
 *   now?: Date,
 * }} [params]
 * @returns {{
 *   year: number,
 *   month: number,
 *   isCurrentMonth: boolean,
 *   previous: { year: number, month: number },
 *   next: { year: number, month: number },
 * }}
 */
export function resolveViewedMonth({ yearParam, monthParam, now = new Date() } = {}) {
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth() + 1; // getMonth() es 0-indexado.

	let year = currentYear;
	let month = currentMonth;

	const yearStr = yearParam == null ? "" : String(yearParam).trim();
	const monthStr = monthParam == null ? "" : String(monthParam).trim();

	if (YEAR_RE.test(yearStr) && MONTH_RE.test(monthStr)) {
		const parsedYear = Number.parseInt(yearStr, 10);
		const parsedMonth = Number.parseInt(monthStr, 10);

		if (parsedMonth >= 1 && parsedMonth <= 12 && parsedYear >= MIN_YEAR) {
			const isFuture =
				parsedYear > currentYear ||
				(parsedYear === currentYear && parsedMonth > currentMonth);
			if (!isFuture) {
				year = parsedYear;
				month = parsedMonth;
			}
		}
	}

	return {
		year,
		month,
		isCurrentMonth: year === currentYear && month === currentMonth,
		previous: previousMonth(year, month),
		next: nextMonth(year, month),
	};
}

/** "septiembre 2026". */
export function formatMonthLabel(year, month) {
	return `${MONTH_NAMES_ES[month - 1] ?? ""} ${year}`;
}
