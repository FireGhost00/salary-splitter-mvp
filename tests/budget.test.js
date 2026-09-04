import { describe, it, expect } from "vitest";
import {
	MASTER_SPLIT,
	splitIncome,
	monthlyProvisionCents,
} from "../src/lib/budget.js";

// Todos los montos en CENTAVOS enteros (CONVENCIONES.md §2).

describe("MASTER_SPLIT", () => {
	it("es 50/30/20 y suma exactamente 100", () => {
		expect(MASTER_SPLIT.necesidad).toBe(50);
		expect(MASTER_SPLIT.deseo).toBe(30);
		expect(MASTER_SPLIT.ahorro).toBe(20);
		expect(
			MASTER_SPLIT.necesidad + MASTER_SPLIT.deseo + MASTER_SPLIT.ahorro,
		).toBe(100);
	});

	it("está congelado (no editable por el usuario)", () => {
		expect(Object.isFrozen(MASTER_SPLIT)).toBe(true);
	});
});

describe("splitIncome — reparto exacto sin Deuda ni Provisión", () => {
	it("divide un ingreso redondo en 50/30/20", () => {
		const r = splitIncome(300000);
		expect(r.shares).toEqual({
			necesidad: 150000,
			deseo: 90000,
			ahorro: 60000,
		});
		expect(r.partial).toBe(false);
		expect(r.deficit).toBe(false);
		expect(r.over_cents).toBe(0);
		expect(r.fixed).toEqual({
			debt_cents: 0,
			provision_cents: 0,
			total_cents: 0,
		});
		// Sin cuota fija, todo el 50 % queda como "Necesidad libre".
		expect(r.necesidad_free_cents).toBe(150000);
	});

	it("manda el residuo de los redondeos a Ahorro (CONVENCIONES §2)", () => {
		const r = splitIncome(100001);
		// floor(50000.5)=50000 ; floor(30000.3)=30000 ; resto -> ahorro
		expect(r.shares.necesidad).toBe(50000);
		expect(r.shares.deseo).toBe(30000);
		expect(r.shares.ahorro).toBe(20001);
	});

	it("con importes diminutos el residuo entero cae íntegro en Ahorro", () => {
		expect(splitIncome(1).shares).toEqual({
			necesidad: 0,
			deseo: 0,
			ahorro: 1,
		});
		expect(splitIncome(7).shares).toEqual({
			necesidad: 3,
			deseo: 2,
			ahorro: 2,
		});
	});
});

describe("splitIncome — Deuda + Provisión cubiertas por completo", () => {
	it("descuenta Deuda y Provisión del 50 % y deja el resto como Necesidad libre", () => {
		const r = splitIncome(300000, { debtCents: 40000, provisionCents: 30000 });
		expect(r.partial).toBe(false);
		expect(r.deficit).toBe(false);
		expect(r.fixed).toEqual({
			debt_cents: 40000,
			provision_cents: 30000,
			total_cents: 70000,
		});
		expect(r.fixed_target).toEqual({
			debt_cents: 40000,
			provision_cents: 30000,
			total_cents: 70000,
		});
		expect(r.necesidad_free_cents).toBe(150000 - 70000);
		expect(r.over_cents).toBe(0);
		// El reparto maestro no cambia por la cuota fija.
		expect(r.shares).toEqual({
			necesidad: 150000,
			deseo: 90000,
			ahorro: 60000,
		});
	});

	it("cuando la cuota fija iguala EXACTAMENTE al 50 %, Necesidad libre = 0 y no hay déficit", () => {
		const r = splitIncome(200000, { debtCents: 60000, provisionCents: 40000 });
		expect(r.partial).toBe(false);
		expect(r.fixed.total_cents).toBe(100000); // == necesidad
		expect(r.necesidad_free_cents).toBe(0);
		expect(r.over_cents).toBe(0);
	});
});

describe("splitIncome — abono parcial (déficit) con reparto proporcional", () => {
	it("reparte el 50 % completo entre Deuda y Provisión a partes iguales cuando faltan importes iguales", () => {
		const r = splitIncome(100000, { debtCents: 40000, provisionCents: 40000 });
		expect(r.partial).toBe(true);
		expect(r.deficit).toBe(true);
		// necesidad = 50000 ; se reparte íntegro (25000 / 25000)
		expect(r.fixed.debt_cents).toBe(25000);
		expect(r.fixed.provision_cents).toBe(25000);
		expect(r.fixed.total_cents).toBe(50000);
		expect(r.necesidad_free_cents).toBe(0);
		// Lo que quedó sin cubrir de la cuota fija del mes.
		expect(r.over_cents).toBe(30000); // 80000 objetivo - 50000 asignado
		expect(r.fixed_target.total_cents).toBe(80000);
	});

	it("reparte proporcionalmente cuando lo que falta de cada rubro es distinto (3:1)", () => {
		const r = splitIncome(100000, { debtCents: 60000, provisionCents: 20000 });
		expect(r.partial).toBe(true);
		// floor(50000 * 60000 / 80000) = 37500 ; resto -> provisión
		expect(r.fixed.debt_cents).toBe(37500);
		expect(r.fixed.provision_cents).toBe(12500);
		expect(r.fixed.debt_cents + r.fixed.provision_cents).toBe(50000);
		// Proporción preservada respecto a los objetivos.
		expect(r.fixed.debt_cents / r.fixed.provision_cents).toBeCloseTo(60000 / 20000);
	});

	it("con déficit y solo Deuda, el 50 % entero va a Deuda y Provisión queda en 0", () => {
		const r = splitIncome(100000, { debtCents: 80000, provisionCents: 0 });
		expect(r.partial).toBe(true);
		expect(r.fixed.debt_cents).toBe(50000);
		expect(r.fixed.provision_cents).toBe(0);
		expect(r.over_cents).toBe(30000);
	});
});

describe("splitIncome — invariante: necesidad + deseo + ahorro === income_cents", () => {
	const incomes = [
		0, 1, 2, 3, 7, 33, 99, 100, 101, 999, 1000, 12345, 100000, 100001,
		250099, 333333, 7777777, 99999999,
	];
	const fixedCombos = [
		{},
		{ debtCents: 0, provisionCents: 0 },
		{ debtCents: 10000, provisionCents: 5000 },
		{ debtCents: 40000, provisionCents: 40000 },
		{ debtCents: 999999, provisionCents: 999999 },
	];

	for (const income of incomes) {
		for (const fixed of fixedCombos) {
			it(`income=${income} fixed=${JSON.stringify(fixed)}`, () => {
				const r = splitIncome(income, fixed);
				const { necesidad, deseo, ahorro } = r.shares;
				expect(necesidad + deseo + ahorro).toBe(r.income_cents);
				expect(r.income_cents).toBe(income);
				// Ningún sobre negativo.
				expect(necesidad).toBeGreaterThanOrEqual(0);
				expect(deseo).toBeGreaterThanOrEqual(0);
				expect(ahorro).toBeGreaterThanOrEqual(0);
				// La asignación fija nunca excede el 50 %.
				expect(r.fixed.total_cents).toBeLessThanOrEqual(necesidad);
				// Necesidad libre + cuota fija asignada = 50 % (salvo en parcial, que es 0).
				if (!r.partial) {
					expect(r.necesidad_free_cents + r.fixed.total_cents).toBe(necesidad);
				} else {
					expect(r.necesidad_free_cents).toBe(0);
				}
			});
		}
	}
});

// --------------------------------------------------------------------------
// Caracterización de entradas FUERA DE CONTRATO. Ni el README ni CONVENCIONES
// definen qué debe pasar con un ingreso <= 0 o no numérico. El código actual
// lo NORMALIZA a 0 en silencio (Math.max(0, Math.round(Number(x) || 0))).
// Estas pruebas fijan ese comportamiento observado; NO son una especificación.
// Ver el informe (punto 7).
// --------------------------------------------------------------------------
describe("splitIncome — entradas fuera de contrato [comportamiento NO documentado]", () => {
	it("ingreso 0 -> todos los sobres en 0, sin déficit", () => {
		const r = splitIncome(0);
		expect(r.income_cents).toBe(0);
		expect(r.shares).toEqual({ necesidad: 0, deseo: 0, ahorro: 0 });
		expect(r.partial).toBe(false);
		expect(r.over_cents).toBe(0);
	});

	it("ingreso negativo -> se recorta a 0 (no lanza, no reparte negativo)", () => {
		const r = splitIncome(-5000, { debtCents: 1000 });
		expect(r.income_cents).toBe(0);
		expect(r.shares).toEqual({ necesidad: 0, deseo: 0, ahorro: 0 });
	});

	it("ingreso no numérico (NaN / string) -> se trata como 0", () => {
		expect(splitIncome(Number.NaN).income_cents).toBe(0);
		expect(splitIncome("abc").income_cents).toBe(0);
		expect(splitIncome(undefined).income_cents).toBe(0);
	});
});

describe("monthlyProvisionCents", () => {
	it("sin rubros -> 0", () => {
		expect(monthlyProvisionCents([])).toBe(0);
		expect(monthlyProvisionCents()).toBe(0);
	});

	it("suma anual / 12 en centavos enteros", () => {
		expect(monthlyProvisionCents([{ annual_amount_cents: 120000 }])).toBe(10000);
		expect(
			monthlyProvisionCents([
				{ annual_amount_cents: 120000 },
				{ annual_amount_cents: 60000 },
			]),
		).toBe(15000);
	});

	it("redondea (Math.round) cuando la división no es exacta", () => {
		expect(monthlyProvisionCents([{ annual_amount_cents: 100000 }])).toBe(8333);
		expect(monthlyProvisionCents([{ annual_amount_cents: 130000 }])).toBe(10833);
	});

	it("ignora rubros negativos o no numéricos", () => {
		expect(
			monthlyProvisionCents([
				{ annual_amount_cents: 120000 },
				{ annual_amount_cents: -999999 },
			]),
		).toBe(10000);
		expect(monthlyProvisionCents([{ annual_amount_cents: "abc" }])).toBe(0);
	});
});
