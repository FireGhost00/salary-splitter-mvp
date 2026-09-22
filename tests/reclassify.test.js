import { describe, it, expect } from "vitest";
import {
	deriveMasterNames,
	deriveSubcategoriesByMaster,
	isReclassifiableExpense,
} from "../src/lib/reclassify.js";

// Lógica de reclasificación compartida por TransactionList.jsx y
// TransactionHistory.jsx. Solo las funciones puras (sin useState/fetch): el
// hook useReclassifyTransaction necesitaría un entorno de React, fuera de
// alcance de esta suite (environment: "node").

describe("deriveMasterNames", () => {
	it("filtra por macro_type 'estandar' y ordena Necesidad, Deseo, Ahorro", () => {
		const categories = [
			{ name: "Ahorro", macro_type: "estandar" },
			{ name: "Deuda", macro_type: "deuda" },
			{ name: "Necesidad", macro_type: "estandar" },
			{ name: "Provisiones", macro_type: "provision" },
			{ name: "Deseo", macro_type: "estandar" },
		];
		expect(deriveMasterNames(categories)).toEqual([
			"Necesidad",
			"Deseo",
			"Ahorro",
		]);
	});

	it("solo devuelve los masters realmente presentes", () => {
		const categories = [{ name: "Deseo", macro_type: "estandar" }];
		expect(deriveMasterNames(categories)).toEqual(["Deseo"]);
	});

	it("sin categorías -> []", () => {
		expect(deriveMasterNames([])).toEqual([]);
		expect(deriveMasterNames()).toEqual([]);
	});
});

describe("deriveSubcategoriesByMaster", () => {
	it("agrupa por parentMaster", () => {
		const subcategories = [
			{ name: "Alquiler", parentMaster: "Necesidad" },
			{ name: "Supermercado", parentMaster: "Necesidad" },
			{ name: "Restaurantes", parentMaster: "Deseo" },
		];
		expect(deriveSubcategoriesByMaster(subcategories)).toEqual({
			Necesidad: ["Alquiler", "Supermercado"],
			Deseo: ["Restaurantes"],
		});
	});

	it("ignora entradas sin name o parentMaster", () => {
		const subcategories = [
			{ name: "Alquiler", parentMaster: "Necesidad" },
			{ name: null, parentMaster: "Necesidad" },
			{ name: "Huérfana", parentMaster: null },
		];
		expect(deriveSubcategoriesByMaster(subcategories)).toEqual({
			Necesidad: ["Alquiler"],
		});
	});

	it("sin subcategorías -> {}", () => {
		expect(deriveSubcategoriesByMaster([])).toEqual({});
		expect(deriveSubcategoriesByMaster()).toEqual({});
	});
});

describe("isReclassifiableExpense", () => {
	const masterNames = ["Necesidad", "Deseo", "Ahorro"];

	it("gasto contra un sobre maestro -> reclasificable", () => {
		expect(
			isReclassifiableExpense(
				{ transaction_type: "gasto", category_id: "Deseo" },
				masterNames,
			),
		).toBe(true);
	});

	it("gasto contra Deuda/Provisiones -> NO reclasificable", () => {
		expect(
			isReclassifiableExpense(
				{ transaction_type: "gasto", category_id: "Deuda" },
				masterNames,
			),
		).toBe(false);
		expect(
			isReclassifiableExpense(
				{ transaction_type: "gasto", category_id: "Provisiones" },
				masterNames,
			),
		).toBe(false);
	});

	it("un ingreso nunca es reclasificable, aunque el category_id sea un master", () => {
		expect(
			isReclassifiableExpense(
				{ transaction_type: "ingreso", category_id: "Necesidad" },
				masterNames,
			),
		).toBe(false);
	});

	it("si el usuario no tiene ese master presente, tampoco es reclasificable", () => {
		expect(
			isReclassifiableExpense(
				{ transaction_type: "gasto", category_id: "Necesidad" },
				["Deseo", "Ahorro"],
			),
		).toBe(false);
	});
});
