import { describe, it, expect } from "vitest";
import { computeRemainingProvisionCents } from "../src/components/ProvisionsDetailedTable.jsx";

describe("computeRemainingProvisionCents", () => {
	it("caso normal: saved > used -> positivo", () => {
		expect(computeRemainingProvisionCents(10000, 4000)).toBe(6000);
	});

	it("exacto: saved === used -> 0", () => {
		expect(computeRemainingProvisionCents(5000, 5000)).toBe(0);
	});

	it("[caso que antes se recortaba a 0] used > saved -> negativo real, sin clamp", () => {
		expect(computeRemainingProvisionCents(3000, 8000)).toBe(-5000);
	});

	it("sin aportes y con uso -> negativo igual al usado", () => {
		expect(computeRemainingProvisionCents(0, 1500)).toBe(-1500);
	});
});
