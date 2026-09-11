import { describe, it, expect } from "vitest";
import { computeYDomain } from "../src/components/ProvisionsGrowthChart.jsx";

describe("computeYDomain", () => {
	it("[caso que antes se recortaba a 0] incluye saldos negativos en minV, sin clamp", () => {
		const { minV, maxV, range } = computeYDomain([1000, -500, 300]);
		expect(minV).toBe(-500);
		expect(maxV).toBe(1000);
		expect(range).toBe(1500);
	});

	it("todo negativo: maxV nunca baja de 1 (evita división por 0 más abajo)", () => {
		const { minV, maxV } = computeYDomain([-200, -800, -100]);
		expect(minV).toBe(-800);
		expect(maxV).toBe(1);
	});

	it("[comportamiento previo al fix] sin valores negativos, minV se queda en 0", () => {
		const { minV, maxV } = computeYDomain([100, 500, 900]);
		expect(minV).toBe(0);
		expect(maxV).toBe(900);
	});

	it("arreglo exacto en 0: minV = 0, maxV con el piso de 1", () => {
		expect(computeYDomain([0, 0, 0])).toEqual({ minV: 0, maxV: 1, range: 1 });
	});

	it("array vacío no lanza (Math.max/min de ningún valor + el 0/1 de piso)", () => {
		expect(computeYDomain([])).toEqual({ minV: 0, maxV: 1, range: 1 });
	});
});
