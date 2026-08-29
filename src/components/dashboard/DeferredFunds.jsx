import { useState } from "react";
import { formatCents } from "../../lib/money";
import DeferredManagerModal from "./DeferredManagerModal.jsx";

/**
 * Isla interactiva: el texto verde del saldo diferido, ahora como botón que
 * abre el gestor de ingresos reservados. Al cerrar el modal tras un borrado
 * exitoso, fuerza recarga para que el SSR recalcule `saldoDiferido`.
 *
 * @param {{ saldoDiferidoInCents?: number, userId?: string }} props
 */
export default function DeferredFunds({ saldoDiferidoInCents = 0, userId }) {
	const [isOpen, setIsOpen] = useState(false);

	if (!(saldoDiferidoInCents > 0)) return null;

	function handleClose(didDelete) {
		if (didDelete) {
			window.location.reload();
			return;
		}
		setIsOpen(false);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="mt-2 cursor-pointer text-sm tabular-nums text-emerald-400 underline-offset-4 transition hover:text-emerald-300 hover:underline"
			>
				+ {formatCents(saldoDiferidoInCents)} reservados para el próximo mes
			</button>

			{isOpen && <DeferredManagerModal userId={userId} onClose={handleClose} />}
		</>
	);
}
