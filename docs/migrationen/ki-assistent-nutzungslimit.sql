-- Additive, per-user, cross-instance limit for ki-assistent.
-- Stores only the user UUID, UTC day/count and a temporary request lease;
-- no prompt, recipe content, IP address or model response is persisted.
begin;

do $$
begin
  if to_regclass('auth.users') is null
     or to_regprocedure('private.konto_aktiv(uuid)') is null then
    raise exception 'Voraussetzung fehlt: auth.users und private.konto_aktiv(uuid) müssen vorhanden sein.';
  end if;
  if to_regclass('public.ki_assistent_nutzung') is not null
     or to_regprocedure('public.ki_assistent_reservieren(uuid,uuid)') is not null
     or to_regprocedure('public.ki_assistent_freigeben(uuid,uuid)') is not null then
    raise exception 'KI-Assistent-Limitobjekte existieren bereits. Vorhandenes Schema zuerst prüfen.';
  end if;
end;
$$;

create table public.ki_assistent_nutzung (
  benutzer_id uuid primary key references auth.users(id) on delete cascade,
  utc_tag date not null,
  anzahl integer not null default 0 check (anzahl between 0 and 20),
  aktive_anfrage uuid,
  reserviert_am timestamptz,
  constraint ki_assistent_reservation_pair check
    ((aktive_anfrage is null) = (reserviert_am is null))
);

alter table public.ki_assistent_nutzung enable row level security;
revoke all on public.ki_assistent_nutzung from public, anon, authenticated;

create function public.ki_assistent_reservieren(p_benutzer_id uuid, p_anfrage_id uuid)
returns table(entscheidung text, verbleibend integer, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  v public.ki_assistent_nutzung%rowtype;
  v_jetzt timestamptz := clock_timestamp();
  v_tag date := (v_jetzt at time zone 'UTC')::date;
  v_leasing interval := interval '3 minutes';
begin
  if p_benutzer_id is null or p_anfrage_id is null
     or not private.konto_aktiv(p_benutzer_id) then
    return query select 'inactive'::text, 0, 0;
    return;
  end if;

  insert into public.ki_assistent_nutzung(benutzer_id, utc_tag, anzahl)
    values (p_benutzer_id, v_tag, 0)
    on conflict (benutzer_id) do nothing;

  -- The row lock serializes simultaneous Edge Function instances per user.
  select * into v
    from public.ki_assistent_nutzung
    where benutzer_id = p_benutzer_id
    for update;

  -- A killed/timed-out worker cannot hold the slot forever. Normal requests
  -- have a 90-second upstream timeout and release in a finally block.
  if v.aktive_anfrage is not null and v.reserviert_am <= v_jetzt - v_leasing then
    update public.ki_assistent_nutzung
      set aktive_anfrage = null, reserviert_am = null
      where benutzer_id = p_benutzer_id
      returning * into v;
  end if;

  if v.aktive_anfrage is not null then
    return query select 'in_progress'::text, greatest(0, 20 - v.anzahl),
      greatest(1, ceil(extract(epoch from (v.reserviert_am + v_leasing - v_jetzt)))::integer);
    return;
  end if;

  if v.utc_tag <> v_tag then
    update public.ki_assistent_nutzung
      set utc_tag = v_tag, anzahl = 0
      where benutzer_id = p_benutzer_id
      returning * into v;
  end if;

  if v.anzahl >= 20 then
    return query select 'daily_limit'::text, 0,
      greatest(1, ceil(extract(epoch from (((v_tag + 1)::timestamp) at time zone 'UTC' - v_jetzt)))::integer);
    return;
  end if;

  update public.ki_assistent_nutzung
    set anzahl = v.anzahl + 1,
        aktive_anfrage = p_anfrage_id,
        reserviert_am = v_jetzt
    where benutzer_id = p_benutzer_id;
  return query select 'allowed'::text, 19 - v.anzahl, 0;
end;
$$;

create function public.ki_assistent_freigeben(p_benutzer_id uuid, p_anfrage_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.ki_assistent_nutzung
    set aktive_anfrage = null, reserviert_am = null
    where benutzer_id = p_benutzer_id and aktive_anfrage = p_anfrage_id;
  return found;
end;
$$;

revoke all on function public.ki_assistent_reservieren(uuid,uuid) from public, anon, authenticated;
revoke all on function public.ki_assistent_freigeben(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ki_assistent_reservieren(uuid,uuid) to service_role;
grant execute on function public.ki_assistent_freigeben(uuid,uuid) to service_role;

commit;
