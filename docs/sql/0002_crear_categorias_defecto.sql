-- PASO 1: RPC de seeding de categorías por defecto.
-- Ejecutar en el SQL Editor de Supabase.

-- RLS en categories (necesario para que el RPC en SECURITY INVOKER pueda insertar).
alter table public.categories enable row level security;

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);

-- Función: crea las categorías por defecto SOLO si el usuario aún no tiene ninguna.
-- SECURITY INVOKER => corre con los permisos del llamante; el INSERT respeta RLS
-- (with check auth.uid() = user_id), así que solo puede sembrar para uno mismo.
-- `type` es NOT NULL en categories; se asigna un tipo razonable a cada nombre.
create or replace function public.crear_categorias_defecto(nuevo_usuario_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.categories where user_id = nuevo_usuario_id
  ) then
    insert into public.categories (user_id, name, type) values
      (nuevo_usuario_id, '🏠 Vivienda',                   'fijo'),
      (nuevo_usuario_id, '🛒 Alimentación',               'fijo'),
      (nuevo_usuario_id, '🚗 Transporte (Honda / Bus)',   'fijo'),
      (nuevo_usuario_id, '💪 Suscripciones (Smart Fit)',  'fijo'),
      (nuevo_usuario_id, '🎉 Salidas y Citas',            'gasto'),
      (nuevo_usuario_id, '🐾 Mascotas (Luna)',            'gasto'),
      (nuevo_usuario_id, '🛍️ Hobbies (Relojes / Switch)', 'gasto'),
      (nuevo_usuario_id, '💰 Ahorro',                     'ahorro');
  end if;
end;
$$;

grant execute on function public.crear_categorias_defecto(uuid) to authenticated;
