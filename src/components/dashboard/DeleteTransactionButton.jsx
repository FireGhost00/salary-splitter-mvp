import { useState } from "react";

/**
 * Isla interactiva: botón de papelera que elimina un movimiento.
 * Hace POST /api/transaction/delete con el id; el endpoint valida la sesión
 * (SSR) y RLS garantiza que solo se borren filas del propio usuario.
 *
 * @param {{ id: number | string }} props
 */
export default function DeleteTransactionButton({ id }) {
	const [isDeleting, setIsDeleting] = useState(false);

	async function handleDelete() {
		if (isDeleting) return;
		if (!window.confirm("¿Eliminar este movimiento?")) return;

		setIsDeleting(true);
		try {
			const response = await fetch("/api/transaction/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});

			if (response.status === 200) {
				// Recarga para reflejar el saldo y la lista (aún no hay store global).
				window.location.reload();
				return;
			}

			const payload = await response.json().catch(() => ({}));
			window.alert(payload.error ?? `Error ${response.status}.`);
		} catch {
			window.alert("No se pudo conectar con el servidor.");
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<button
			type="button"
			onClick={handleDelete}
			disabled={isDeleting}
			aria-label="Eliminar movimiento"
			className="text-slate-600 transition-colors hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="h-4 w-4"
				aria-hidden="true"
			>
				<path d="M3 6h18" />
				<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
				<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
				<path d="M10 11v6" />
				<path d="M14 11v6" />
			</svg>
		</button>
	);
}
