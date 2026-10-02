import { describe, it, expect } from "vitest";
import { formatMonthLabel, resolveViewedMonth } from "../src/lib/period.js";

// "Hoy" fijo para toda la suite: 2026-10-01 (coincide con la fecha real del
// entorno en el momento de escribir esto, pero se inyecta explícitamente
// para que la suite no dependa del reloj del sistema).
const NOW = new Date(2026, 9, 1); // mes 9 = octubre (0-indexado)

describe("resolveViewedMonth", () => {
	it("sin params -> mes actual", () => {
		const r = resolveViewedMonth({ now: NOW });
		expect(r.year).toBe(2026);
		expect(r.month).toBe(10);
		expect(r.isCurrentMonth).toBe(true);
	});

	it("params null/undefined -> mes actual", () => {
		const r = resolveViewedMonth({ yearParam: null, monthParam: undefined, now: NOW });
		expect(r.year).toBe(2026);
		expect(r.month).toBe(10);
	});

	it("solo uno de los dos params presente -> mes actual (no se mezcla con el otro)", () => {
		const r1 = resolveViewedMonth({ yearParam: "2025", monthParam: null, now: NOW });
		expect(r1).toMatchObject({ year: 2026, month: 10 });
		const r2 = resolveViewedMonth({ yearParam: null, monthParam: "3", now: NOW });
		expect(r2).toMatchObject({ year: 2026, month: 10 });
	});

	it("params no enteros -> mes actual", () => {
		const r = resolveViewedMonth({ yearParam: "dos mil26", monthParam: "sep", now: NOW });
		expect(r).toMatchObject({ year: 2026, month: 10 });
	});

	it("month fuera de 1..12 -> mes actual", () => {
		expect(resolveViewedMonth({ yearParam: "2026", monthParam: "0", now: NOW })).toMatchObject(
			{ year: 2026, month: 10 },
		);
		expect(resolveViewedMonth({ yearParam: "2026", monthParam: "13", now: NOW })).toMatchObject(
			{ year: 2026, month: 10 },
		);
		expect(resolveViewedMonth({ yearParam: "2026", monthParam: "-1", now: NOW })).toMatchObject(
			{ year: 2026, month: 10 },
		);
	});

	it("año absurdo (no son 4 dígitos) -> mes actual", () => {
		for (const bad of ["1", "26", "20260", "0000", "-2026"]) {
			expect(
				resolveViewedMonth({ yearParam: bad, monthParam: "9", now: NOW }),
			).toMatchObject({ year: 2026, month: 10 });
		}
	});

	it("mes futuro (mismo año) -> mes actual", () => {
		const r = resolveViewedMonth({ yearParam: "2026", monthParam: "11", now: NOW });
		expect(r).toMatchObject({ year: 2026, month: 10 });
	});

	it("mes futuro (año siguiente) -> mes actual", () => {
		const r = resolveViewedMonth({ yearParam: "2027", monthParam: "1", now: NOW });
		expect(r).toMatchObject({ year: 2026, month: 10 });
	});

	it("mes pasado válido -> ese mes exacto", () => {
		const r = resolveViewedMonth({ yearParam: "2026", monthParam: "9", now: NOW });
		expect(r.year).toBe(2026);
		expect(r.month).toBe(9);
		expect(r.isCurrentMonth).toBe(false);
	});

	it("año pasado válido -> ese mes exacto", () => {
		const r = resolveViewedMonth({ yearParam: "2025", monthParam: "12", now: NOW });
		expect(r.year).toBe(2025);
		expect(r.month).toBe(12);
		expect(r.isCurrentMonth).toBe(false);
	});

	it("mes actual pedido explícitamente -> isCurrentMonth true", () => {
		const r = resolveViewedMonth({ yearParam: "2026", monthParam: "10", now: NOW });
		expect(r).toMatchObject({ year: 2026, month: 10, isCurrentMonth: true });
	});

	it("[cruce de año] previous de enero -> diciembre del año anterior", () => {
		const r = resolveViewedMonth({ yearParam: "2026", monthParam: "1", now: NOW });
		expect(r.previous).toEqual({ year: 2025, month: 12 });
	});

	it("[cruce de año] next de diciembre -> enero del año siguiente", () => {
		// 2025-12 es pasado respecto a NOW (2026-10), así que es válido.
		const r = resolveViewedMonth({ yearParam: "2025", monthParam: "12", now: NOW });
		expect(r.next).toEqual({ year: 2026, month: 1 });
	});

	it("previous/next dentro del mismo año, sin cruce", () => {
		const r = resolveViewedMonth({ yearParam: "2026", monthParam: "9", now: NOW });
		expect(r.previous).toEqual({ year: 2026, month: 8 });
		expect(r.next).toEqual({ year: 2026, month: 10 });
	});
});

describe("formatMonthLabel", () => {
	it("formatea mes y año en español", () => {
		expect(formatMonthLabel(2026, 9)).toBe("septiembre 2026");
		expect(formatMonthLabel(2026, 1)).toBe("enero 2026");
		expect(formatMonthLabel(2025, 12)).toBe("diciembre 2025");
	});
});
