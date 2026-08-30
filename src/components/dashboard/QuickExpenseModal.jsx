import { useState } from "react";
import ExpenseModal from "../ExpenseModal.jsx";

/**
 * FAB (botón flotante) para registrar un gasto rápido. Guarda el estado
 * `isModalOpen` y renderiza <ExpenseModal>. Un solo island: el FAB y el modal
 * comparten estado, por eso viven juntos.
 *
 * El botón flota por encima del Navbar inferior (bottom-24 z-50).
 *
 * @param {{
 *   categories?: { id: string, name: string, macro_type?: string }[],
 *   provisionItems?: { id: string, label: string, availableCents?: number }[],
 *   subcategories?: { name: string, parentMaster: string }[],
 * }} props
 */
export default function QuickExpenseModal({
	categories = [],
	provisionItems = [],
	subcategories = [],
}) {
	const [isModalOpen, setIsModalOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setIsModalOpen(true)}
				aria-label="Registrar gasto rápido"
				className="fixed bottom-24 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-2xl leading-none text-slate-100 shadow-lg transition-colors hover:bg-slate-700"
			>
				+
			</button>

			<ExpenseModal
				open={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				categories={categories}
				provisionItems={provisionItems}
				subcategories={subcategories}
			/>
		</>
	);
}
