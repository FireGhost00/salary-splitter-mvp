/**
 * Patrón Money (CONVENCIONES.md §2).
 *
 * En toda la lógica y el estado el dinero se maneja como ENTEROS de centavos.
 * La división entre 100 y el formateo a moneda ocurren ÚNICA Y EXCLUSIVAMENTE
 * aquí, en el último paso antes de renderizar.
 */

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

/** `184275` -> `"$1,842.75"`. Único punto donde se divide entre 100. */
export function formatCents(amountInCents: number): string {
	return CURRENCY_FORMATTER.format(amountInCents / 100);
}

export interface CurrencyParts {
	minusSign: string;
	currencySymbol: string;
	integer: string;
	decimal: string;
	fraction: string;
}

/**
 * Igual que `formatCents` pero devuelve las piezas por separado para poder
 * darles distinto tamaño tipográfico (p. ej. centavos más pequeños).
 */
export function formatCentsParts(amountInCents: number): CurrencyParts {
	const parts = CURRENCY_FORMATTER.formatToParts(amountInCents / 100);
	const pick = (type: Intl.NumberFormatPartTypes): string =>
		parts
			.filter((part) => part.type === type)
			.map((part) => part.value)
			.join("");

	return {
		minusSign: pick("minusSign"),
		currencySymbol: pick("currency"),
		integer: parts
			.filter((part) => part.type === "integer" || part.type === "group")
			.map((part) => part.value)
			.join(""),
		decimal: pick("decimal"),
		fraction: pick("fraction"),
	};
}
