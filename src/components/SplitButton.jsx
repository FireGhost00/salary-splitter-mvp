import { useState } from "react";

/**
 * Botón "Dividir Salario": dispara POST /api/split-salary, que reparte el
 * base_salary del perfil entre las reglas de distribución del usuario.
 */
export default function SplitButton() {
	const [isPending, setIsPending] = useState(false);
	const [message, setMessage] = useState(null); // { type: "ok" | "error", text }

	async function handleClick() {
		if (isPending) return;
		setIsPending(true);
		setMessage(null);
		try {
			const response = await fetch("/api/split-salary", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			const payload = await response.json().catch(() => ({}));

			if (response.ok) {
				setMessage({
					type: "ok",
					text: `Salario distribuido en ${payload.count ?? 0} sobres.`,
				});
				// Refresca para que el dashboard recalcule los saldos.
				setTimeout(() => window.location.reload(), 900);
			} else {
				setMessage({
					type: "error",
					text: payload.error ?? `Error ${response.status}.`,
				});
			}
		} catch {
			setMessage({
				type: "error",
				text: "No se pudo conectar con el servidor.",
			});
		} finally {
			setIsPending(false);
		}
	}

	return (
		<div className="space-y-2">
			<button
				type="button"
				onClick={handleClick}
				disabled={isPending}
				className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isPending ? "Distribuyendo…" : "Dividir Salario"}
			</button>

			{message && (
				<p
					className={`text-xs ${
						message.type === "ok" ? "text-emerald-400" : "text-rose-400"
					}`}
				>
					{message.text}
				</p>
			)}
		</div>
	);
}
