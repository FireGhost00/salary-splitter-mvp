-- PASO 1: categorías 100% dinámicas (el usuario crea las suyas).
-- La tabla ya permite varias por usuario (PK compuesta (user_id, name)).
-- Este script:
--   - añade `id` (uuid) como pediste,
--   - hace `type` opcional (ya no se usa; solo macro_type),
--   - macro_type esperado: 'deuda' | 'provision' | 'estandar'.
-- Ejecutar en el SQL Editor de Supabase.

alter table public.categories
	add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists categories_id_key on public.categories (id);

alter table public.categories alter column type drop not null;

-- (opcional) normaliza los macro_type antiguos a la nueva nomenclatura:
-- update public.categories
--   set macro_type = 'estandar'
--   where macro_type is null or macro_type not in ('deuda', 'provision');
