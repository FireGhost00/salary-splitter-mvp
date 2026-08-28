/**
 * Datos de previsualización (mock).
 *
 * TODOS los montos están en centavos como enteros, igual que se guardarán en
 * PostgreSQL (CONVENCIONES.md §2). Reemplazar por consultas a Supabase cuando
 * la base de datos esté conectada.
 */

export type EnvelopeType = "ahorro" | "gasto" | "fijo" | "meta";

export interface Envelope {
	id: string;
	title: string;
	type: EnvelopeType;
	/** Saldo en centavos (entero). */
	balanceInCents: number;
}

/** Saldo total disponible en centavos -> $1,250.00 */
export const heroBalanceInCents = 125_000;

/** Suma exactamente heroBalanceInCents (75_000 + 20_000 + 30_000). */
export const envelopes: Envelope[] = [
	{ id: "vivienda", title: "Vivienda", type: "fijo", balanceInCents: 75_000 },
	{ id: "salidas", title: "Salidas", type: "gasto", balanceInCents: 20_000 },
	{ id: "ahorro", title: "Ahorro", type: "ahorro", balanceInCents: 30_000 },
];
