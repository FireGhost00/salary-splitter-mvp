-- ============================================================================
-- CANDIDATO A REVISIÓN MANUAL — NO EJECUTAR TODAVÍA.
--
-- Contexto: `budget_config` y `provision_items` las usa activamente
-- src/pages/api/save-budget-config.js (además de register-income.js y
-- expense.js), pero NO están definidas en docs/sql/schema.sql ni en ninguna
-- migración anterior (0001-0005). Por eso su estado real de Row Level
-- Security en el panel de Supabase no se puede verificar desde el repo.
--
-- ANTES de aplicar este archivo:
--   1. Entra al panel de Supabase → Authentication → Policies (o
--      Database → Tables → <tabla> → RLS) y confirma si `budget_config` y
--      `provision_items` YA tienen RLS habilitado y qué políticas tienen.
--   2. Si YA tienen RLS + políticas equivalentes a `auth.uid() = user_id`
--      para las 4 operaciones, este archivo es innecesario (aplicarlo de
--      todos modos es seguro y no-op gracias a `if not exists` /
--      `drop policy if exists`, pero no lo apliques sin ese diagnóstico).
--   3. Si NO tienen RLS, o tienen políticas más laxas: revisa este archivo
--      con calma (nombres y tipos de columna en particular) y aplícalo tú
--      mismo en el SQL Editor cuando estés listo.
--
-- Origen de las columnas: reconstruidas leyendo el código, NO desde un
-- `pg_dump` real. Verifica columnas/tipos contra la base de datos antes de
-- ejecutar — si difieren, `create table if not exists` será un no-op (no
-- rompe nada) pero las políticas fallarán en la columna que no coincida.
--   - budget_config:    user_id, debt_enabled, debt_monthly_cents,
--                        provisions_enabled, updated_at
--                        (src/pages/api/save-budget-config.js,
--                        src/pages/api/register-income.js)
--   - provision_items:  id, user_id, label, annual_amount_cents
--                        (src/pages/api/save-budget-config.js,
--                        src/pages/api/register-income.js,
--                        src/pages/api/expense.js)
--
-- Sigue el mismo patrón que docs/sql/schema.sql (tabla + RLS + políticas
-- select/insert/update/delete acotadas a auth.uid() = user_id).
--
-- IMPORTANTE: este archivo NO toca `profiles`. La política DELETE de
-- `profiles` queda pospuesta a propósito hasta confirmar si el producto
-- tendrá una función de "eliminar cuenta" (ver docs/INFRAESTRUCTURA.md).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) budget_config  (1 fila por usuario — deuda mensual + toggle de provisiones)
-- ----------------------------------------------------------------------------
create table if not exists public.budget_config (
	user_id            uuid primary key references public.profiles (id) on delete cascade,
	debt_enabled       boolean not null default false,
	debt_monthly_cents int4 not null default 0,
	provisions_enabled boolean not null default false,
	updated_at         timestamptz not null default now()
);

alter table public.budget_config enable row level security;

drop policy if exists budget_config_select_own on public.budget_config;
create policy budget_config_select_own on public.budget_config
	for select using (auth.uid() = user_id);

drop policy if exists budget_config_insert_own on public.budget_config;
create policy budget_config_insert_own on public.budget_config
	for insert with check (auth.uid() = user_id);

drop policy if exists budget_config_update_own on public.budget_config;
create policy budget_config_update_own on public.budget_config
	for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists budget_config_delete_own on public.budget_config;
create policy budget_config_delete_own on public.budget_config
	for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) provision_items  (rubros anuales de Provisión Mensual, varios por usuario)
-- ----------------------------------------------------------------------------
create table if not exists public.provision_items (
	id                  uuid primary key default gen_random_uuid(),
	user_id             uuid not null references public.profiles (id) on delete cascade,
	label               text not null,
	annual_amount_cents int4 not null default 0,
	unique (user_id, label)
);

alter table public.provision_items enable row level security;

drop policy if exists provision_items_select_own on public.provision_items;
create policy provision_items_select_own on public.provision_items
	for select using (auth.uid() = user_id);

drop policy if exists provision_items_insert_own on public.provision_items;
create policy provision_items_insert_own on public.provision_items
	for insert with check (auth.uid() = user_id);

drop policy if exists provision_items_update_own on public.provision_items;
create policy provision_items_update_own on public.provision_items
	for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists provision_items_delete_own on public.provision_items;
create policy provision_items_delete_own on public.provision_items
	for delete using (auth.uid() = user_id);
