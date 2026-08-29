-- PASO 1 (multi-tenant): tabla de perfiles + RLS.
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  first_name text,
  base_salary decimal(10, 2) default 0
);

alter table public.profiles enable row level security;

-- Cada usuario solo puede ver / crear / actualizar su propia fila (auth.uid() = id).
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
