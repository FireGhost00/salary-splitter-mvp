import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `vi.mock` se hoist-ea al tope del módulo; `vi.hoisted` deja `limitMock`
// disponible dentro de esa factory sin problemas de orden de inicialización.
const { limitMock, redisCtor, ratelimitCtor, slidingWindowMock } = vi.hoisted(() => {
	// mockImplementation necesita funciones normales (no arrow): `new Redis()` /
	// `new Ratelimit()` invocan el mock con `new`, y las arrow no son construibles.
	const limitMock = vi.fn();
	const redisCtor = vi.fn().mockImplementation(function RedisMock() {
		return {};
	});
	const slidingWindowMock = vi.fn((max, window) => ({ max, window }));
	const ratelimitCtor = vi.fn().mockImplementation(function RatelimitMock() {
		return { limit: limitMock };
	});
	ratelimitCtor.slidingWindow = slidingWindowMock;
	return { limitMock, redisCtor, ratelimitCtor, slidingWindowMock };
});

vi.mock("@upstash/redis", () => ({ Redis: redisCtor }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: ratelimitCtor }));

import {
	DEFAULT_LIMIT,
	__resetRateLimiterCache,
	checkRateLimit,
	rateLimitResponse,
} from "../src/lib/rate-limit.js";

function stubUpstashEnv() {
	vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
	vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
}

beforeEach(() => {
	__resetRateLimiterCache();
	limitMock.mockReset();
	redisCtor.mockClear();
	ratelimitCtor.mockClear();
	vi.unstubAllEnvs();
});

afterEach(() => {
	vi.unstubAllEnvs();
	__resetRateLimiterCache();
	vi.useRealTimers();
});

describe("checkRateLimit — sin Upstash configurado (fail-open)", () => {
	it("deja pasar y avisa UNA sola vez por proceso", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		return checkRateLimit("user-1:expense")
			.then((r1) => {
				expect(r1).toEqual({ allowed: true, remaining: -1, retryAfterSec: 0 });
				return checkRateLimit("user-1:expense");
			})
			.then((r2) => {
				expect(r2.allowed).toBe(true);
				expect(warnSpy).toHaveBeenCalledTimes(1);
				const entry = JSON.parse(warnSpy.mock.calls[0][0]);
				expect(entry.level).toBe("warn");
				expect(entry.message).toMatch(/UPSTASH_REDIS_REST_URL/);
				expect(limitMock).not.toHaveBeenCalled();
				warnSpy.mockRestore();
			});
	});
});

describe("checkRateLimit — clave inválida", () => {
	it("key vacía o no-string -> fail-open, ni siquiera consulta Upstash", async () => {
		stubUpstashEnv();
		expect(await checkRateLimit("")).toEqual({
			allowed: true,
			remaining: -1,
			retryAfterSec: 0,
		});
		expect(await checkRateLimit(null)).toEqual({
			allowed: true,
			remaining: -1,
			retryAfterSec: 0,
		});
		expect(limitMock).not.toHaveBeenCalled();
	});
});

describe("checkRateLimit — con Upstash configurado", () => {
	it("usa slidingWindow(20, '60 s') al construir el cliente", async () => {
		stubUpstashEnv();
		limitMock.mockResolvedValue({ success: true, remaining: 19, reset: Date.now() + 60000 });

		await checkRateLimit("user-1:register-income");

		expect(DEFAULT_LIMIT).toEqual({ max: 20, window: "60 s" });
		expect(slidingWindowMock).toHaveBeenCalledWith(20, "60 s");
	});

	it("dentro del límite -> allowed true con el `remaining` de Upstash", async () => {
		stubUpstashEnv();
		limitMock.mockResolvedValue({ success: true, remaining: 5, reset: Date.now() + 40000 });

		const r = await checkRateLimit("user-1:register-income");
		expect(r).toEqual({ allowed: true, remaining: 5, retryAfterSec: 0 });
		expect(limitMock).toHaveBeenCalledWith("user-1:register-income");
	});

	it("límite excedido -> allowed false con retryAfterSec del `reset`", async () => {
		stubUpstashEnv();
		limitMock.mockResolvedValue({
			success: false,
			remaining: 0,
			reset: Date.now() + 12000,
		});

		const r = await checkRateLimit("user-2:expense");
		expect(r.allowed).toBe(false);
		expect(r.remaining).toBe(0);
		expect(r.retryAfterSec).toBeGreaterThanOrEqual(11);
		expect(r.retryAfterSec).toBeLessThanOrEqual(12);
	});

	it("reconstruye el cliente Redis/Ratelimit UNA sola vez (singleton)", async () => {
		stubUpstashEnv();
		limitMock.mockResolvedValue({ success: true, remaining: 1, reset: Date.now() + 1000 });

		await checkRateLimit("user-1:expense");
		await checkRateLimit("user-1:save-budget-config");

		expect(redisCtor).toHaveBeenCalledTimes(1);
		expect(ratelimitCtor).toHaveBeenCalledTimes(1);
		expect(limitMock).toHaveBeenCalledTimes(2);
	});
});

describe("checkRateLimit — Upstash caído o lento (fail-open)", () => {
	it("si Upstash lanza, deja pasar y loguea el error (sin exponer datos sensibles)", async () => {
		stubUpstashEnv();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		limitMock.mockRejectedValue(new Error("ECONNRESET"));

		const r = await checkRateLimit("user-3:register-income");
		expect(r).toEqual({ allowed: true, remaining: -1, retryAfterSec: 0 });

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const entry = JSON.parse(errorSpy.mock.calls[0][0]);
		expect(entry).toMatchObject({
			level: "error",
			endpoint: "rate-limit",
			user_id: "user-3",
			error: "ECONNRESET",
		});
		errorSpy.mockRestore();
	});

	it("si Upstash no responde a tiempo, corta por timeout y deja pasar", async () => {
		vi.useFakeTimers();
		stubUpstashEnv();
		vi.spyOn(console, "error").mockImplementation(() => {});
		limitMock.mockImplementation(() => new Promise(() => {})); // nunca resuelve

		const pending = checkRateLimit("user-4:save-budget-config");
		await vi.advanceTimersByTimeAsync(1600);
		const r = await pending;

		expect(r.allowed).toBe(true);
	});
});

describe("rateLimitResponse", () => {
	it("es 429 con Retry-After y cuerpo { error }", async () => {
		const res = rateLimitResponse(3);
		expect(res.status).toBe(429);
		expect(res.headers.get("retry-after")).toBe("3");
		expect(await res.json()).toEqual({
			error: "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.",
		});
	});

	it("Retry-After nunca baja de 1", () => {
		expect(rateLimitResponse(0).headers.get("retry-after")).toBe("1");
		expect(rateLimitResponse().headers.get("retry-after")).toBe("1");
	});
});
