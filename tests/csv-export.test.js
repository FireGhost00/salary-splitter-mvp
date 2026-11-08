import { describe, it, expect } from "vitest";
import {
	CRLF,
	UTF8_BOM,
	buildTransactionsCsv,
	centsToDecimalString,
	escapeCsvField,
	fetchAllRows,
	groupFor503020,
	parseExportRange,
} from "../src/lib/csv-export.js";
import { SYS_CAT } from "../src/lib/budget.js";

// "Hoy" fijo: 2026-09-15 (mes 8 = septiembre, 0-indexado).
const NOW = new Date(2026, 8, 15);

describe("centsToDecimalString", () => {
	it.each([
		[1700, "17.00"],
		[-1700, "-17.00"],
		[5, "0.05"],
		[-5, "-0.05"],
		[1, "0.01"],
		[-1, "-0.01"],
		[99, "0.99"],
		[-99, "-0.99"],
		[100, "1.00"],
		[0, "0.00"],
		[-0, "0.00"],
		[123456789, "1234567.89"],
		[-2147483647, "-21474836.47"],
	])("%i -> %s", (cents, expected) => {
		expect(centsToDecimalString(cents)).toBe(expected);
	});

	it("no usa separador de miles", () => {
		expect(centsToDecimalString(100000000)).toBe("1000000.00");
	});

	it.each([1.5, NaN, Infinity, "1700", null, undefined])(
		"rechaza %s (no es un entero de centavos)",
		(bad) => {
			expect(() => centsToDecimalString(bad)).toThrow(TypeError);
		},
	);
});

describe("escapeCsvField", () => {
	it("null/undefined -> vacío", () => {
		expect(escapeCsvField(null)).toBe("");
		expect(escapeCsvField(undefined)).toBe("");
	});

	it("texto simple sin cambios", () => {
		expect(escapeCsvField("Supermercado")).toBe("Supermercado");
		expect(escapeCsvField("Alimentación ñ")).toBe("Alimentación ñ");
	});

	it("coma -> entre comillas", () => {
		expect(escapeCsvField("pan, leche")).toBe('"pan, leche"');
	});

	it("comillas internas se duplican", () => {
		expect(escapeCsvField('dijo "hola"')).toBe('"dijo ""hola"""');
	});

	it("LF, CR y CRLF -> entre comillas, intactos", () => {
		expect(escapeCsvField("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
		expect(escapeCsvField("a\rb")).toBe('"a\rb"');
		expect(escapeCsvField("a\r\nb")).toBe('"a\r\nb"');
	});

	it.each(["=SUM(A1:A9)", "+1", "-2", "@cmd"])(
		"inyección de fórmula: %s lleva apóstrofo",
		(value) => {
			expect(escapeCsvField(value)).toBe(`'${value}`);
		},
	);

	it("fórmula con coma: apóstrofo y además comillas", () => {
		expect(escapeCsvField('=HYPERLINK("x",1)')).toBe(`"'=HYPERLINK(""x"",1)"`);
	});

	it("solo mira el primer carácter", () => {
		expect(escapeCsvField("a=b")).toBe("a=b");
		expect(escapeCsvField("Ingreso → Ahorro")).toBe("Ingreso → Ahorro");
	});

	it("formulaGuard: false (columna monto) no antepone apóstrofo", () => {
		expect(escapeCsvField("-17.00", { formulaGuard: false })).toBe("-17.00");
	});
});

describe("groupFor503020", () => {
	it("Necesidad, Deuda y Provisiones -> Necesidad", () => {
		expect(groupFor503020(SYS_CAT.necesidad)).toBe("Necesidad");
		expect(groupFor503020(SYS_CAT.deuda)).toBe("Necesidad");
		expect(groupFor503020(SYS_CAT.provision)).toBe("Necesidad");
	});

	it("Deseo y Ahorro", () => {
		expect(groupFor503020(SYS_CAT.deseo)).toBe("Deseo");
		expect(groupFor503020(SYS_CAT.ahorro)).toBe("Ahorro");
	});

	it("cualquier otro -> Otro", () => {
		expect(groupFor503020("Vivienda")).toBe("Otro");
		expect(groupFor503020("necesidad")).toBe("Otro");
		expect(groupFor503020(null)).toBe("Otro");
		expect(groupFor503020(undefined)).toBe("Otro");
	});
});

describe("buildTransactionsCsv", () => {
	const HEADER =
		"fecha,mes,tipo,sobre,grupo_50_30_20,subcategoria,rubro_provision,concepto,monto,grupo_ingreso";

	it("BOM + encabezado + CRLF aunque no haya filas", () => {
		expect(buildTransactionsCsv([])).toBe(`${UTF8_BOM}${HEADER}${CRLF}`);
	});

	it("una fila por movimiento con todas las columnas", () => {
		const provLabels = new Map([["pi-1", "Marchamo"]]);
		const csv = buildTransactionsCsv(
			[
				{
					effective_date: "2026-09-01",
					transaction_type: "ingreso",
					category_id: "Provisiones",
					subcategory: null,
					provision_item_id: "pi-1",
					description: null,
					label: "Ingreso → Marchamo",
					amount_cents: 12500,
					group_id: "g-1",
				},
				{
					effective_date: "2026-09-03",
					transaction_type: "gasto",
					category_id: "Deseo",
					subcategory: "Restaurantes",
					provision_item_id: null,
					description: "Cena, con \"amigos\"\nsegunda línea",
					label: "Gasto",
					amount_cents: -1,
					group_id: null,
				},
			],
			provLabels,
		);

		expect(csv.startsWith(UTF8_BOM)).toBe(true);
		expect(csv.endsWith(CRLF)).toBe(true);
		const body = csv.slice(UTF8_BOM.length);
		expect(body).toBe(
			[
				HEADER,
				"2026-09-01,2026-09,ingreso,Provisiones,Necesidad,,Marchamo,Ingreso → Marchamo,125.00,g-1",
				'2026-09-03,2026-09,gasto,Deseo,Deseo,Restaurantes,,"Cena, con ""amigos""\nsegunda línea",-0.01,',
			].join(CRLF) + CRLF,
		);
	});

	it("concepto = description, o label si description está vacía", () => {
		const base = {
			effective_date: "2026-09-10",
			transaction_type: "gasto",
			category_id: "Necesidad",
			amount_cents: -500,
		};
		const csv = buildTransactionsCsv([
			{ ...base, description: "Bus", label: "Gasto" },
			{ ...base, description: "", label: "Super" },
			{ ...base, description: "   ", label: "Agua" },
			{ ...base, description: null, label: "Luz (sobregiro)" },
		]);
		const conceptos = csv
			.slice(UTF8_BOM.length)
			.split(CRLF)
			.slice(1, -1)
			.map((line) => line.split(",")[7]);
		expect(conceptos).toEqual(["Bus", "Super", "Agua", "Luz (sobregiro)"]);
	});

	it("concepto que empieza con = lleva apóstrofo; el monto negativo no", () => {
		const csv = buildTransactionsCsv([
			{
				effective_date: "2026-09-10",
				transaction_type: "gasto",
				category_id: "Deseo",
				description: "=1+1",
				label: "Gasto",
				amount_cents: -1700,
			},
		]);
		const line = csv.slice(UTF8_BOM.length).split(CRLF)[1];
		expect(line).toBe("2026-09-10,2026-09,gasto,Deseo,Deseo,,,'=1+1,-17.00,");
	});

	it("effective_date con hora (ISO) se recorta a YYYY-MM-DD", () => {
		const csv = buildTransactionsCsv([
			{
				effective_date: "2026-12-31T00:00:00+00:00",
				transaction_type: "gasto",
				category_id: "Ahorro",
				label: "x",
				amount_cents: -100,
			},
		]);
		expect(csv.split(CRLF)[1].startsWith("2026-12-31,2026-12,")).toBe(true);
	});

	it("acepta un objeto plano como mapa de rubros; id desconocido -> vacío", () => {
		const csv = buildTransactionsCsv(
			[
				{
					effective_date: "2026-09-01",
					transaction_type: "gasto",
					category_id: "Provisiones",
					provision_item_id: "pi-9",
					label: "Gasto",
					amount_cents: -100,
				},
				{
					effective_date: "2026-09-01",
					transaction_type: "gasto",
					category_id: "Provisiones",
					provision_item_id: "pi-desconocido",
					label: "Gasto",
					amount_cents: -100,
				},
			],
			{ "pi-9": "Seguro" },
		);
		const lines = csv.split(CRLF);
		expect(lines[1].split(",")[6]).toBe("Seguro");
		expect(lines[2].split(",")[6]).toBe("");
	});
});

describe("parseExportRange", () => {
	it("año completo", () => {
		expect(parseExportRange({ yearParam: "2025", now: NOW })).toEqual({
			from: "2025-01-01",
			to: "2025-12-31",
			filename: "movimientos-2025.csv",
		});
	});

	it("año en curso sin mes", () => {
		expect(parseExportRange({ yearParam: "2026", monthParam: "", now: NOW })).toEqual({
			from: "2026-01-01",
			to: "2026-12-31",
			filename: "movimientos-2026.csv",
		});
	});

	it("mes en curso", () => {
		expect(parseExportRange({ yearParam: "2026", monthParam: "9", now: NOW })).toEqual({
			from: "2026-09-01",
			to: "2026-09-30",
			filename: "movimientos-2026-09.csv",
		});
	});

	it("enero y diciembre (meses límite)", () => {
		expect(parseExportRange({ yearParam: "2025", monthParam: "1", now: NOW })).toEqual({
			from: "2025-01-01",
			to: "2025-01-31",
			filename: "movimientos-2025-01.csv",
		});
		expect(parseExportRange({ yearParam: "2025", monthParam: "12", now: NOW })).toEqual({
			from: "2025-12-01",
			to: "2025-12-31",
			filename: "movimientos-2025-12.csv",
		});
	});

	it("febrero normal y bisiesto", () => {
		expect(parseExportRange({ yearParam: "2025", monthParam: "2", now: NOW }).to).toBe(
			"2025-02-28",
		);
		expect(parseExportRange({ yearParam: "2024", monthParam: "02", now: NOW }).to).toBe(
			"2024-02-29",
		);
	});

	it("1970 es el mínimo válido", () => {
		expect(parseExportRange({ yearParam: "1970", monthParam: "1", now: NOW }).from).toBe(
			"1970-01-01",
		);
	});

	it("tolera espacios alrededor", () => {
		expect(
			parseExportRange({ yearParam: " 2026 ", monthParam: " 9 ", now: NOW }).filename,
		).toBe("movimientos-2026-09.csv");
	});

	it.each([
		[undefined, "falta"],
		[null, "null"],
		["", "vacío"],
		["26", "2 dígitos"],
		["20260", "5 dígitos"],
		["abcd", "no numérico"],
		["2026.0", "decimal"],
		["-2026", "negativo"],
	])("year inválido (%s, %s) -> error", (yearParam) => {
		const r = parseExportRange({ yearParam, now: NOW });
		expect(r).toHaveProperty("error");
		expect(r.error).toMatch(/year/);
	});

	it("year < 1970 -> error", () => {
		expect(parseExportRange({ yearParam: "1969", now: NOW }).error).toMatch(/1970/);
		expect(parseExportRange({ yearParam: "0000", now: NOW }).error).toMatch(/1970/);
	});

	it("year futuro -> error", () => {
		expect(parseExportRange({ yearParam: "2027", now: NOW }).error).toMatch(/futuro/);
	});

	it.each(["0", "13", "00", "-1", "1.5", "abc", "123"])(
		"month inválido (%s) -> error",
		(monthParam) => {
			const r = parseExportRange({ yearParam: "2025", monthParam, now: NOW });
			expect(r.error).toMatch(/month/);
		},
	);

	it("mes futuro del año en curso -> error", () => {
		expect(
			parseExportRange({ yearParam: "2026", monthParam: "10", now: NOW }).error,
		).toMatch(/futuro/);
	});
});

describe("fetchAllRows", () => {
	/** Simula supabase con `total` filas y un tope de servidor `cap`. */
	function fakeSource(total, cap = Infinity) {
		const calls = [];
		const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
		const fetchPage = async (from, to) => {
			calls.push([from, to]);
			const end = Math.min(to + 1, from + cap, total);
			return { data: all.slice(from, end), error: null, count: total };
		};
		return { fetchPage, calls };
	}

	it("trae más de un lote hasta agotar", async () => {
		const { fetchPage, calls } = fakeSource(2500);
		const { rows, error } = await fetchAllRows(fetchPage, { pageSize: 1000 });
		expect(error).toBeNull();
		expect(rows).toHaveLength(2500);
		expect(rows.at(-1).id).toBe(2500);
		expect(calls).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
		]);
	});

	it("total múltiplo exacto del lote: no hace una consulta extra", async () => {
		const { fetchPage, calls } = fakeSource(2000);
		const { rows } = await fetchAllRows(fetchPage, { pageSize: 1000 });
		expect(rows).toHaveLength(2000);
		expect(calls).toHaveLength(2);
	});

	it("si el servidor topa por debajo del lote pedido, no se pierde nada", async () => {
		const { fetchPage } = fakeSource(1200, 500);
		const { rows } = await fetchAllRows(fetchPage, { pageSize: 1000 });
		expect(rows).toHaveLength(1200);
		expect(new Set(rows.map((r) => r.id)).size).toBe(1200);
	});

	it("sin filas", async () => {
		const { fetchPage, calls } = fakeSource(0);
		const { rows } = await fetchAllRows(fetchPage);
		expect(rows).toEqual([]);
		expect(calls).toHaveLength(1);
	});

	it("propaga el error de un lote", async () => {
		let n = 0;
		const { error } = await fetchAllRows(async () => {
			n += 1;
			return n === 1
				? { data: [{ id: 1 }], error: null, count: 5 }
				: { data: null, error: { message: "boom" }, count: null };
		}, { pageSize: 1 });
		expect(error).toEqual({ message: "boom" });
	});
});
