import { describe, it, expect, beforeEach } from "vitest";
import {
	DEFAULT_LIMIT,
	__resetRateLimitStore,
	checkRateLimit,
	rateLimitResponse,
} from "../src/lib/rate-limit.js";

beforeEach(() => __resetRateLimitStore());

const cfg = { max: 5, windowMs: 1000 };

describe("checkRateLimit", () => {
	it("deja pasar exactamente `max` intentos en la misma ventana", () => {
		const now = 1_000_000;
		for (let i = 1; i <= 5; i++) {
			const r = checkRateLimit("u1:ep", { ...cfg, now });
			expect(r.allowed).toBe(true);
			expect(r.remaining).toBe(5 - i);
		}
	});

	it("bloquea el intento nº max+1 dentro de la ventana", () => {
		const now = 2_000_000;
		for (let i = 0; i < 5; i++) checkRateLimit("u1:ep", { ...cfg, now });
		const r = checkRateLimit("u1:ep", { ...cfg, now });
		expect(r.allowed).toBe(false);
		expect(r.remaining).toBe(0);
		expect(r.retryAfterSec).toBeGreaterThan(0);
		expect(r.retryAfterSec).toBeLessThanOrEqual(1);
	});

	it("se reinicia cuando la ventana expira", () => {
		const now = 3_000_000;
		for (let i = 0; i < 5; i++) checkRateLimit("u1:ep", { ...cfg, now });
		expect(checkRateLimit("u1:ep", { ...cfg, now }).allowed).toBe(false);

		const r = checkRateLimit("u1:ep", { ...cfg, now: now + 1001 });
		expect(r.allowed).toBe(true);
		expect(r.remaining).toBe(4);
	});

	it("claves distintas (usuario / endpoint) son independientes", () => {
		const now = 4_000_000;
		for (let i = 0; i < 5; i++) checkRateLimit("u1:ep", { ...cfg, now });
		expect(checkRateLimit("u1:ep", { ...cfg, now }).allowed).toBe(false);
		expect(checkRateLimit("u2:ep", { ...cfg, now }).allowed).toBe(true);
		expect(checkRateLimit("u1:otro", { ...cfg, now }).allowed).toBe(true);
	});

	it("fail-open con key vacía o no-string", () => {
		expect(checkRateLimit("", { max: 1, windowMs: 1000 }).allowed).toBe(true);
		expect(checkRateLimit(null, { max: 1, windowMs: 1000 }).allowed).toBe(true);
		expect(checkRateLimit(undefined, { max: 1, windowMs: 1000 }).allowed).toBe(true);
	});

	it("usa DEFAULT_LIMIT (20 / 60 s) si no se pasa config", () => {
		expect(DEFAULT_LIMIT).toEqual({ max: 20, windowMs: 60_000 });
		const now = 5_000_000;
		for (let i = 0; i < 20; i++) {
			expect(checkRateLimit("d:ep", { now }).allowed).toBe(true);
		}
		expect(checkRateLimit("d:ep", { now }).allowed).toBe(false);
	});
});

describe("rateLimitResponse", () => {
	it("es 429 con Retry-After y cuerpo { error }", async () => {
		const res = rateLimitResponse(3);
		expect(res.status).toBe(429);
		expect(res.headers.get("retry-after")).toBe("3");
		expect(res.headers.get("content-type")).toBe("application/json");
		expect(await res.json()).toEqual({
			error: "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.",
		});
	});

	it("Retry-After nunca baja de 1", () => {
		expect(rateLimitResponse(0).headers.get("retry-after")).toBe("1");
		expect(rateLimitResponse().headers.get("retry-after")).toBe("1");
	});
});
