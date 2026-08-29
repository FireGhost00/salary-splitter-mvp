-- PASO 1: columna descriptiva en transactions.
-- Ejecutar en el SQL Editor de Supabase.

alter table public.transactions add column if not exists description text;
