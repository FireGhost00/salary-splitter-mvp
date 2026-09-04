import { describe, it, expect } from "vitest";
import {
	INT4_MAX,
	ValidationError,
	jsonError,
	parseJsonBody,
	v,
} from "../src/lib/validation.js";

const throws = (fn) => expect(fn).toThrow(ValidationError);

describe("parseJsonBody", () => {
	it("devuelve el objeto de un body JSON válido", async () => {
		const req = new Request("http://x/api", {
			method: "POST",
			body: JSON.stringify({ a: 1 }),
		});
		await expect(parseJsonBody(req)).resolves.toEqual({ a: 1 });
	});

	it("lanza ValidationError si el body no es JSON", async () => {
		const req = new Request("http://x/api", { method: "POST", body: "{ roto" });
		await expect(parseJsonBody(req)).rejects.toBeInstanceOf(ValidationError);
		await expect(parseJsonBody(req)).rejects.toThrow("Cuerpo JSON inválido.");
	});
});

describe("jsonError", () => {
	it("Response 400 por defecto con { error }", async () => {
		const res = jsonError("mensaje claro");
		expect(res.status).toBe(400);
		expect(res.headers.get("content-type")).toBe("application/json");
		expect(await res.json()).toEqual({ error: "mensaje claro" });
	});

	it("respeta un status explícito", () => {
		expect(jsonError("x", 422).status).toBe(422);
	});
});

describe("v.intCents — Patrón Money (§2/§4)", () => {
	it("acepta enteros positivos", () => {
		expect(v.intCents(1, "x")).toBe(1);
		expect(v.intCents(150050, "x")).toBe(150050);
		expect(v.intCents(1e3, "x")).toBe(1000); // 1e3 es el número 1000, no un string
	});

	it("rechaza floats", () => {
		throws(() => v.intCents(50.5, "x"));
		throws(() => v.intCents(1500.01, "x"));
	});

	it("rechaza strings numéricos (no se coacciona)", () => {
		throws(() => v.intCents("5000", "x"));
		throws(() => v.intCents("", "x"));
	});

	it("rechaza NaN / Infinity / null / undefined / boolean", () => {
		throws(() => v.intCents(Number.NaN, "x"));
		throws(() => v.intCents(Number.POSITIVE_INFINITY, "x"));
		throws(() => v.intCents(null, "x"));
		throws(() => v.intCents(undefined, "x"));
		throws(() => v.intCents(true, "x"));
	});

	it("respeta `min`", () => {
		throws(() => v.intCents(0, "x")); // min 1 por defecto
		throws(() => v.intCents(-1, "x"));
		expect(v.intCents(0, "x", { min: 0 })).toBe(0);
		throws(() => v.intCents(-1, "x", { min: 0 }));
	});

	it("corta en el techo int4", () => {
		expect(v.intCents(INT4_MAX, "x")).toBe(INT4_MAX);
		throws(() => v.intCents(INT4_MAX + 1, "x"));
	});

	it("el mensaje nombra el campo", () => {
		expect(() => v.intCents(1.5, "amount_cents")).toThrow("`amount_cents`");
	});
});

describe("v.optionalIntCents", () => {
	it("ausente -> default (null si no se indica)", () => {
		expect(v.optionalIntCents(undefined, "x")).toBe(null);
		expect(v.optionalIntCents(null, "x", { default: 0 })).toBe(0);
	});
	it("presente -> valida como intCents", () => {
		expect(v.optionalIntCents(500, "x")).toBe(500);
		throws(() => v.optionalIntCents(5.5, "x"));
		throws(() => v.optionalIntCents("500", "x"));
	});
});

describe("v.nonEmptyString", () => {
	it("recorta y devuelve", () => {
		expect(v.nonEmptyString("  Alquiler  ", "name")).toBe("Alquiler");
	});
	it("rechaza vacío, solo-espacios y no-string", () => {
		throws(() => v.nonEmptyString("", "name"));
		throws(() => v.nonEmptyString("   ", "name"));
		throws(() => v.nonEmptyString(123, "name"));
		throws(() => v.nonEmptyString(undefined, "name"));
	});
	it("respeta maxLen (sobre el valor recortado)", () => {
		expect(v.nonEmptyString("abc  ", "name", { maxLen: 3 })).toBe("abc");
		throws(() => v.nonEmptyString("abcd", "name", { maxLen: 3 }));
	});
});

describe("v.optionalString", () => {
	it("ausente / vacío -> null", () => {
		expect(v.optionalString(undefined, "d")).toBe(null);
		expect(v.optionalString(null, "d")).toBe(null);
		expect(v.optionalString("   ", "d")).toBe(null);
	});
	it("presente -> recortado", () => {
		expect(v.optionalString("  nota ", "d")).toBe("nota");
	});
	it("no-string -> 400", () => {
		throws(() => v.optionalString(5, "d"));
	});
});

describe("v.boolean", () => {
	it("acepta true / false", () => {
		expect(v.boolean(true, "b")).toBe(true);
		expect(v.boolean(false, "b")).toBe(false);
	});
	it("rechaza 'true', 1, 0, null, undefined", () => {
		throws(() => v.boolean("true", "b"));
		throws(() => v.boolean(1, "b"));
		throws(() => v.boolean(0, "b"));
		throws(() => v.boolean(null, "b"));
		throws(() => v.boolean(undefined, "b"));
	});
});

describe("v.enum", () => {
	const macros = ["necesidad", "deseo", "ahorro"];
	it("acepta un valor del conjunto", () => {
		expect(v.enum("deseo", "macro_type", macros)).toBe("deseo");
	});
	it("rechaza fuera del conjunto (incluye variantes de caja)", () => {
		throws(() => v.enum("Deseo", "macro_type", macros));
		throws(() => v.enum("otro", "macro_type", macros));
		throws(() => v.enum(undefined, "macro_type", macros));
	});
});

describe("v.optionalIsoDate", () => {
	it("ausente -> null", () => {
		expect(v.optionalIsoDate(undefined, "effective_date")).toBe(null);
		expect(v.optionalIsoDate(null, "effective_date")).toBe(null);
	});
	it("acepta fechas de calendario válidas, incl. bisiesto", () => {
		expect(v.optionalIsoDate("2026-02-14", "d")).toBe("2026-02-14");
		expect(v.optionalIsoDate("2024-02-29", "d")).toBe("2024-02-29");
	});
	it("rechaza formato incorrecto", () => {
		throws(() => v.optionalIsoDate("2026-2-1", "d"));
		throws(() => v.optionalIsoDate("2026/02/01", "d"));
		throws(() => v.optionalIsoDate("14-02-2026", "d"));
		throws(() => v.optionalIsoDate(20260214, "d"));
	});
	it("rechaza fechas imposibles", () => {
		throws(() => v.optionalIsoDate("2026-13-01", "d"));
		throws(() => v.optionalIsoDate("2026-00-10", "d"));
		throws(() => v.optionalIsoDate("2026-02-30", "d"));
		throws(() => v.optionalIsoDate("2023-02-29", "d")); // 2023 no bisiesto
	});
});

describe("v.optionalUuid", () => {
	it("ausente -> null", () => {
		expect(v.optionalUuid(undefined, "id")).toBe(null);
	});
	it("acepta UUID canónico (recorta espacios)", () => {
		const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
		expect(v.optionalUuid(` ${id} `, "id")).toBe(id);
	});
	it("rechaza cadenas que no son UUID", () => {
		throws(() => v.optionalUuid("nope", "id"));
		throws(() => v.optionalUuid("3f2504e0-4f89-11d3-9a0c", "id"));
		throws(() => v.optionalUuid(123, "id"));
	});
});

describe("v.optionalArray", () => {
	it("ausente -> []", () => {
		expect(v.optionalArray(undefined, "items")).toEqual([]);
		expect(v.optionalArray(null, "items")).toEqual([]);
	});
	it("array -> se devuelve tal cual", () => {
		const a = [1, 2];
		expect(v.optionalArray(a, "items")).toBe(a);
	});
	it("no-array -> 400", () => {
		throws(() => v.optionalArray({}, "items"));
		throws(() => v.optionalArray("x", "items"));
	});
});
