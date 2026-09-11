import { describe, it, expect } from "vitest";
import {
	resolveOverdraftMode,
	buildExpensePayload,
} from "../src/components/ExpenseModal.jsx";

// Lógica de sobregiro extraída de ExpenseModal.jsx (Fase "permitir negativos").
// Se importan solo las funciones puras -> sin renderizar el componente,
// sin jsdom ni Testing Library.

describe("resolveOverdraftMode", () => {
	it("[el bug que arregló este cambio] sin sobres con saldo -> fuerza 'negative' aunque el usuario tenga elegido 'fallback'", () => {
		expect(resolveOverdraftMode(0, "fallback")).toBe("negative");
	});

	it("[caso que NO debía cambiar] con opciones disponibles, el default sigue siendo 'fallback'", () => {
		expect(resolveOverdraftMode(1, "fallback")).toBe("fallback");
		expect(resolveOverdraftMode(3, "fallback")).toBe("fallback");
	});

	it("con opciones disponibles, respeta que el usuario elija 'negative' de todos modos", () => {
		expect(resolveOverdraftMode(2, "negative")).toBe("negative");
	});

	it("sin opciones y el usuario ya en 'negative', se queda en 'negative'", () => {
		expect(resolveOverdraftMode(0, "negative")).toBe("negative");
	});
});

describe("buildExpensePayload", () => {
	const base = {
		amountCents: 5000,
		concept: "  Súper del sábado  ",
		effectiveDate: "2026-09-11",
		selection: "Necesidad",
		selectedSub: null,
		selectedProvisionItem: null,
		selectedCategory: { id: "Necesidad", name: "Necesidad" },
		isOverdraft: false,
		overdraftMode: "fallback",
		effectiveFallback: "",
	};

	it("gasto normal (sin sobregiro): sin ningún campo fallback_*", () => {
		const body = buildExpensePayload(base);
		expect(body).toEqual({
			amount_cents: 5000,
			description: "Súper del sábado",
			effective_date: "2026-09-11",
			category_id: "Necesidad",
			label: "Necesidad",
		});
		expect(body).not.toHaveProperty("fallback_category_id");
		expect(body).not.toHaveProperty("fallback_provision_item_id");
	});

	it("[modo negativo] con sobregiro, sin ningún campo fallback_* en el body", () => {
		const body = buildExpensePayload({
			...base,
			isOverdraft: true,
			overdraftMode: "negative",
			effectiveFallback: "Deseo", // aunque hubiera una opción elegida, no se manda
		});
		expect(body).not.toHaveProperty("fallback_category_id");
		expect(body).not.toHaveProperty("fallback_provision_item_id");
	});

	it("modo 'fallback' con sobregiro y respaldo = otro master -> fallback_category_id", () => {
		const body = buildExpensePayload({
			...base,
			isOverdraft: true,
			overdraftMode: "fallback",
			effectiveFallback: "Ahorro",
		});
		expect(body.fallback_category_id).toBe("Ahorro");
		expect(body).not.toHaveProperty("fallback_provision_item_id");
	});

	it("modo 'fallback' con sobregiro y respaldo = rubro de provisión (prefijo pi:) -> fallback_provision_item_id", () => {
		const body = buildExpensePayload({
			...base,
			isOverdraft: true,
			overdraftMode: "fallback",
			effectiveFallback: "pi:abc-123",
		});
		expect(body.fallback_provision_item_id).toBe("abc-123");
		expect(body).not.toHaveProperty("fallback_category_id");
	});

	it("subcategoría: category_id/subcategory/label salen de selectedSub, no de selection", () => {
		const body = buildExpensePayload({
			...base,
			selection: "sub:Alquiler",
			selectedSub: { name: "Alquiler", parentMaster: "Necesidad" },
		});
		expect(body.category_id).toBe("Necesidad");
		expect(body.subcategory).toBe("Alquiler");
		expect(body.label).toBe("Alquiler");
	});

	it("rubro de provisión: category_id fijo 'Provisiones' + provision_item_id + label", () => {
		const body = buildExpensePayload({
			...base,
			selection: "pi:xyz-9",
			selectedProvisionItem: { id: "xyz-9", label: "Vacaciones" },
		});
		expect(body.category_id).toBe("Provisiones");
		expect(body.provision_item_id).toBe("xyz-9");
		expect(body.label).toBe("Vacaciones");
	});

	it("recorta la descripción (concept) igual que el componente original", () => {
		const body = buildExpensePayload({ ...base, concept: "   " });
		expect(body.description).toBe("");
	});
});
