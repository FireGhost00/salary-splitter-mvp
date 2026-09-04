import { describe, it, expect } from "vitest";
import { formatCents, formatCentsParts } from "../src/lib/money.ts";

// El dinero entra SIEMPRE como enteros de centavos; formatCents es el único
// punto donde se divide entre 100 y se formatea a USD (CONVENCIONES.md §2).

describe("formatCents — formato USD (en-US)", () => {
	it("montos con dólares y centavos", () => {
		expect(formatCents(184275)).toBe("$1,842.75");
		expect(formatCents(199)).toBe("$1.99");
		expect(formatCents(250099)).toBe("$2,500.99");
	});

	it("cero", () => {
		expect(formatCents(0)).toBe("$0.00");
	});

	it("centavos de un solo dígito (menos de $1)", () => {
		expect(formatCents(5)).toBe("$0.05");
		expect(formatCents(9)).toBe("$0.09");
		expect(formatCents(50)).toBe("$0.50");
	});

	it("centavos de un solo dígito con parte entera", () => {
		expect(formatCents(105)).toBe("$1.05");
		expect(formatCents(1010)).toBe("$10.10");
	});

	it("cantidades redondas mantienen los dos decimales", () => {
		expect(formatCents(100)).toBe("$1.00");
		expect(formatCents(1000)).toBe("$10.00");
	});

	it("separador de miles", () => {
		expect(formatCents(100000000)).toBe("$1,000,000.00");
	});

	it("montos negativos (signo antes del símbolo, estilo en-US)", () => {
		expect(formatCents(-2599)).toBe("-$25.99");
		expect(formatCents(-5)).toBe("-$0.05");
	});
});

describe("formatCentsParts — piezas separadas", () => {
	it("descompone un monto positivo", () => {
		expect(formatCentsParts(184275)).toEqual({
			minusSign: "",
			currencySymbol: "$",
			integer: "1,842",
			decimal: ".",
			fraction: "75",
		});
	});

	it("descompone un monto negativo con centavos de un dígito", () => {
		expect(formatCentsParts(-5)).toEqual({
			minusSign: "-",
			currencySymbol: "$",
			integer: "0",
			decimal: ".",
			fraction: "05",
		});
	});
});
