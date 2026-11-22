-- Esquema y políticas RLS para avisos Web Push del Observatorio JUAN
-- Pegar y ejecutar completo en Supabase -> SQL Editor -> New query.
-- Compatible con claves nuevas de Supabase: sb_publishable_... (navegador) y sb_secret_... (GitHub Actions).

create extension if not exists pgcrypto;

-- 1. Suscripciones de navegadores / PWA instaladas
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now(),
  ultimo_envio_ok timestamptz,
  activo boolean not null default true,
  constraint chk_endpoint_https check (endpoint like 'https://%' and length(endpoint) > 16),
  constraint chk_keys_nonempty check (length(p256dh) > 16 and length(auth) > 8)
);

create index if not exists idx_push_suscripciones_activo
  on public.push_suscripciones (activo)
  where activo = true;

alter table public.push_suscripciones enable row level security;

-- Bloquear lectura, actualización directa y borrado desde clave pública (sb_publishable_)
revoke all on table public.push_suscripciones from anon, authenticated;
grant insert on table public.push_suscripciones to anon, authenticated;
grant select, insert, update, delete on table public.push_suscripciones to service_role;

drop policy if exists "permitir_insert_suscripcion_publica" on public.push_suscripciones;
create policy "permitir_insert_suscripcion_publica"
  on public.push_suscripciones
  for insert
  to anon, authenticated
  with check (
    activo = true
    and endpoint like 'https://%'
    and length(endpoint) > 16
    and length(p256dh) > 16
    and length(auth) > 8
  );

-- Función segura (SECURITY DEFINER) para registrar o reactivar SOLO la suscripción propia (upsert por endpoint)
-- No devuelve filas, evitando que un cliente público pueda leer endpoints de otras personas.
create or replace function public.registrar_suscripcion_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) <= 16 then
    raise exception 'Endpoint inválido';
  end if;
  if p_p256dh is null or length(p_p256dh) <= 16 or p_auth is null or length(p_auth) <= 8 then
    raise exception 'Claves de suscripción inválidas';
  end if;

  insert into public.push_suscripciones (endpoint, p256dh, auth, activo)
  values (p_endpoint, p_p256dh, p_auth, true)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        activo = true;
end;
$$;

-- Función segura para que un dispositivo desactive ÚNICAMENTE su propio endpoint
create or replace function public.desactivar_suscripcion_push(
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_endpoint is null or p_endpoint not like 'https://%' then
    return;
  end if;

  update public.push_suscripciones
  set activo = false
  where endpoint = p_endpoint;
end;
$$;

revoke all on function public.registrar_suscripcion_push(text, text, text) from public;
revoke all on function public.desactivar_suscripcion_push(text) from public;
grant execute on function public.registrar_suscripcion_push(text, text, text) to anon, authenticated;
grant execute on function public.desactivar_suscripcion_push(text) to anon, authenticated;

-- 2. Estado anti-repetición del robot (cerrada por completo al público)
create table if not exists public.push_estado (
  id text primary key,
  ultima_lectura_iso text,
  ultimo_nivel_cm numeric,
  ultimo_estado_cota text not null default 'verde',
  ultimo_aviso_tipo text,
  ultimo_aviso_en timestamptz,
  aviso_sin_datos_enviado boolean not null default false,
  aviso_sin_datos_en timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.push_estado enable row level security;
revoke all on table public.push_estado from anon, authenticated;
grant select, insert, update, delete on table public.push_estado to service_role;
-- Sin políticas para anon/authenticated: solo sb_secret_ (service_role en GitHub Actions) puede leer y escribir aquí.
