-- PASO 1 (distribución en cascada): monto objetivo por categoría.
-- `target_amount` en CENTAVOS enteros (CONVENCIONES.md §2).
--   - macro_type = 'deuda'     -> monto total adeudado.
--   - macro_type = 'provision' -> provisión mensual objetivo.
-- Ejecutar en el SQL Editor de Supabase.

alter table public.categories
	add column if not exists target_amount int4 not null default 0;
