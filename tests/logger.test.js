import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError, logWarn, redact, withLogging } from "../src/lib/logger.js";

function fakeContext({ userId = "user-1", method = "POST" } = {}) {
	return {
		request: { method },
		locals: userId === undefined ? {} : { user: userId ? { id: userId } : null },
	};
}

describe("redact", () => {
	it("no toca texto normal", () => {
		expect(redact("categoría no encontrada")).toBe("categoría no encontrada");
	});

	it("sustituye un JWT por [redacted]", () => {
		const jwt =
			"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
		expect(redact(`token inválido: ${jwt}`)).toBe("token inválido: [redacted]");
	});

	it("sustituye una cookie de sesión de Supabase por [redacted]", () => {
		const cookie = "sb-abcxyz-auth-token=base64-abc123.def456";
		expect(redact(`Cookie: ${cookie}`)).toBe("Cookie: [redacted]");
	});

	it("valores no-string pasan sin tocar", () => {
		expect(redact(42)).toBe(42);
		expect(redact(null)).toBe(null);
		expect(redact(undefined)).toBe(undefined);
	});
});

describe("logError", () => {
	let spy;
	beforeEach(() => {
		spy = vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => spy.mockRestore());

	it("imprime UNA línea JSON con la forma { level, endpoint, method, status, user_id, error, timestamp }", () => {
		logError({
			endpoint: "expense",
			method: "POST",
			status: 500,
			userId: "user-1",
			error: new Error("duplicate key"),
		});

		expect(spy).toHaveBeenCalledTimes(1);
		const entry = JSON.parse(spy.mock.calls[0][0]);
		expect(entry).toMatchObject({
			level: "error",
			endpoint: "expense",
			method: "POST",
			status: 500,
			user_id: "user-1",
			error: "duplicate key",
		});
		expect(typeof entry.timestamp).toBe("string");
		expect(new Date(entry.timestamp).toString()).not.toBe("Invalid Date");
	});

	it("acepta un Error, un string o un objeto con .message", () => {
		logError({ endpoint: "e", method: "GET", status: 500, error: new Error("a") });
		logError({ endpoint: "e", method: "GET", status: 500, error: "b" });
		logError({ endpoint: "e", method: "GET", status: 500, error: { message: "c" } });

		const messages = spy.mock.calls.map((c) => JSON.parse(c[0]).error);
		expect(messages).toEqual(["a", "b", "c"]);
	});

	it("un error sin mensaje reconocible cae a 'error desconocido'", () => {
		logError({ endpoint: "e", method: "GET", status: 500, error: null });
		expect(JSON.parse(spy.mock.calls[0][0]).error).toBe("error desconocido");
	});

	it("userId ausente -> user_id: null", () => {
		logError({ endpoint: "e", method: "GET", status: 500, error: "x" });
		expect(JSON.parse(spy.mock.calls[0][0]).user_id).toBe(null);
	});

	it("redacta un JWT embebido en el mensaje", () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc";
		logError({ endpoint: "e", method: "GET", status: 500, error: `token: ${jwt}` });
		expect(JSON.parse(spy.mock.calls[0][0]).error).toBe("token: [redacted]");
	});

	it("trunca mensajes muy largos a 500 caracteres", () => {
		logError({ endpoint: "e", method: "GET", status: 500, error: "x".repeat(1000) });
		expect(JSON.parse(spy.mock.calls[0][0]).error.length).toBe(500);
	});
});

describe("logWarn", () => {
	let spy;
	beforeEach(() => {
		spy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => spy.mockRestore());

	it("imprime una línea JSON con { level: 'warn', endpoint, message, timestamp }", () => {
		logWarn({ endpoint: "rate-limit", message: "Upstash sin configurar" });

		expect(spy).toHaveBeenCalledTimes(1);
		const entry = JSON.parse(spy.mock.calls[0][0]);
		expect(entry).toMatchObject({
			level: "warn",
			endpoint: "rate-limit",
			message: "Upstash sin configurar",
		});
		expect(typeof entry.timestamp).toBe("string");
	});

	it("redacta un JWT embebido en el mensaje", () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc";
		logWarn({ endpoint: "rate-limit", message: `token: ${jwt}` });
		expect(JSON.parse(spy.mock.calls[0][0]).message).toBe("token: [redacted]");
	});
});

describe("withLogging", () => {
	let spy;
	beforeEach(() => {
		spy = vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => spy.mockRestore());

	it("una respuesta 2xx pasa intacta y NO se loguea", async () => {
		const handler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
		const wrapped = withLogging("test-endpoint", handler);
		const res = await wrapped(fakeContext());

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(spy).not.toHaveBeenCalled();
	});

	it("respuestas 4xx (400/401/422/429) pasan intactas y NO se loguean", async () => {
		for (const status of [400, 401, 422, 429]) {
			spy.mockClear();
			const handler = async () =>
				new Response(JSON.stringify({ error: "esperado" }), { status });
			const wrapped = withLogging("test-endpoint", handler);
			const res = await wrapped(fakeContext());

			expect(res.status).toBe(status);
			expect(spy).not.toHaveBeenCalled();
		}
	});

	it("una respuesta >= 500 se loguea (con el mensaje del body) y se devuelve SIN modificar", async () => {
		const handler = async () =>
			new Response(JSON.stringify({ error: "duplicate key value" }), { status: 500 });
		const wrapped = withLogging("save-budget-config", handler);
		const res = await wrapped(fakeContext({ userId: "user-9" }));

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "duplicate key value" });

		expect(spy).toHaveBeenCalledTimes(1);
		const entry = JSON.parse(spy.mock.calls[0][0]);
		expect(entry).toMatchObject({
			endpoint: "save-budget-config",
			method: "POST",
			status: 500,
			user_id: "user-9",
			error: "duplicate key value",
		});
	});

	it("una excepción no controlada se captura, se loguea y responde 500 genérico", async () => {
		const handler = async () => {
			throw new Error("falta SUPABASE_URL");
		};
		const wrapped = withLogging("register-income", handler);
		const res = await wrapped(fakeContext({ userId: "user-2" }));

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "Error interno del servidor." });

		expect(spy).toHaveBeenCalledTimes(1);
		const entry = JSON.parse(spy.mock.calls[0][0]);
		expect(entry.endpoint).toBe("register-income");
		expect(entry.user_id).toBe("user-2");
		expect(entry.error).toBe("falta SUPABASE_URL");
	});

	it("sin sesión en locals -> user_id: null, sin romper", async () => {
		const handler = async () => new Response(JSON.stringify({ error: "x" }), { status: 500 });
		const wrapped = withLogging("get-history", handler);
		const res = await wrapped(fakeContext({ userId: null }));

		expect(res.status).toBe(500);
		expect(JSON.parse(spy.mock.calls[0][0]).user_id).toBe(null);
	});
});
