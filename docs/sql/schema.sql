-- ============================================================================
-- SalarySplitter — Esquema relacional completo (tablas + FK + RLS + índices)
-- Ejecutar en el SQL Editor de Supabase (proyecto limpio).
--
-- Supersede a 0001_profiles.sql y 0003_transactions_description.sql.
-- La función crear_categorias_defecto (0002) y la vista monthly_balances son
-- aparte: ver el bloque final de este archivo.
--
-- NOTA: además de las FK de `user_id` que pediste, se incluyen FK COMPUESTAS
-- (user_id, category_id) -> categories(user_id, name). El código las necesita
-- (p. ej. el embed `categories(name)` en /api/distribute). Están marcadas
-- "[FK categoría]"; si no las quieres, elimina esas 2 constraints.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) profiles  (1:1 con auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
	id          uuid primary key references auth.users (id) on delete cascade,
	first_name  text,
	base_salary numeric not null default 0
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
	for select using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
	for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
	for update using (auth.uid() = id) with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 2) categories  (PK compuesta (user_id, name): el resto del esquema referencia
--    la categoría por su NOMBRE, no por un id)
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
	user_id    uuid not null references public.profiles (id) on delete cascade,
	name       text not null,
	type       text not null,
	macro_type text,
	primary key (user_id, name)
);

alter table public.categories enable row level security;

drop policy if exists categories_select_own on public.categories;
create policy categories_select_own on public.categories
	for select using (auth.uid() = user_id);

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
	for insert with check (auth.uid() = user_id);

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
	for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
	for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) distribution_rules  (% de reparto del salario por categoría)
-- ----------------------------------------------------------------------------
create table if not exists public.distribution_rules (
	user_id     uuid not null references public.profiles (id) on delete cascade,
	category_id text not null,
	percentage  int4 not null check (percentage between 0 and 100),
	primary key (user_id, category_id),
	-- [FK categoría]
	constraint distribution_rules_category_fkey
		foreign key (user_id, category_id)
		references public.categories (user_id, name)
		on update cascade on delete cascade
);

alter table public.distribution_rules enable row level security;

drop policy if exists distribution_rules_select_own on public.distribution_rules;
create policy distribution_rules_select_own on public.distribution_rules
	for select using (auth.uid() = user_id);

drop policy if exists distribution_rules_insert_own on public.distribution_rules;
create policy distribution_rules_insert_own on public.distribution_rules
	for insert with check (auth.uid() = user_id);

drop policy if exists distribution_rules_update_own on public.distribution_rules;
create policy distribution_rules_update_own on public.distribution_rules
	for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists distribution_rules_delete_own on public.distribution_rules;
create policy distribution_rules_delete_own on public.distribution_rules
	for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) transactions
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
	id               bigserial primary key,
	user_id          uuid not null references public.profiles (id) on delete cascade,
	category_id      text not null,
	label            text,
	amount_cents     int4 not null,
	transaction_type text not null,
	created_at       timestamptz not null default now(),
	effective_date   date not null default current_date,
	description      text,
	-- [FK categoría]
	constraint transactions_category_fkey
		foreign key (user_id, category_id)
		references public.categories (user_id, name)
		on update cascade on delete cascade
);

alter table public.transactions enable row level security;

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
	for select using (auth.uid() = user_id);

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
	for insert with check (auth.uid() = user_id);

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
	for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
	for delete using (auth.uid() = user_id);

create index if not exists transactions_user_effdate_idx
	on public.transactions (user_id, effective_date);
create index if not exists transactions_user_created_idx
	on public.transactions (user_id, created_at desc);
create index if not exists transactions_user_category_idx
	on public.transactions (user_id, category_id);

-- ============================================================================
-- APARTE (requerido por la app, no forma parte de tu lista de tablas):
--
--  * Función  public.crear_categorias_defecto(uuid)  -> docs/sql/0002_*.sql
--  * Vista    public.monthly_balances                -> definición de referencia:
--
--      create or replace view public.monthly_balances
--      with (security_invoker = on) as
--      select
--        t.category_id,
--        extract(year  from t.effective_date)::numeric as year,
--        extract(month from t.effective_date)::numeric as month,
--        sum(t.amount_cents)::bigint                   as balance
--      from public.transactions t
--      group by t.category_id,
--               extract(year  from t.effective_date),
--               extract(month from t.effective_date);
--
--    (Si ya tienes una vista monthly_balances funcionando, NO la sobrescribas.)
-- ============================================================================
