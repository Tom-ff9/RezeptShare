-- DRAFT ONLY: Erst nach bestätigter Produktions-Schemaaufnahme und Freigabe.
-- Additive Erweiterung; verändert weder bestehende Rezepte noch Benutzer/Bilder.
begin;

do $$
begin
  if to_regprocedure('private.konto_aktiv(uuid)') is null or to_regclass('auth.users') is null then
    raise exception 'Voraussetzung fehlt: private.konto_aktiv(uuid). Abbruch ohne Änderungen.';
  end if;
  if to_regclass('public.rezept_import_nutzung') is not null
     or to_regprocedure('public.rezept_import_limit(uuid)') is not null then
    raise exception 'Importlimit-Objekte existieren bereits. Vorhandenes Schema zuerst prüfen.';
  end if;
end;
$$;

create table public.rezept_import_nutzung (
    person uuid primary key references auth.users(id) on delete cascade,
    tag date not null,
    anzahl integer not null check (anzahl between 0 and 10),
    zuletzt timestamptz not null
);
alter table public.rezept_import_nutzung enable row level security;
revoke all on public.rezept_import_nutzung from public, anon, authenticated;

create function public.rezept_import_limit(p_person uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    v public.rezept_import_nutzung%rowtype;
    t timestamptz := clock_timestamp();
    d date := (t at time zone 'UTC')::date;
begin
    if not private.konto_aktiv(p_person) then return false; end if;
    insert into public.rezept_import_nutzung(person,tag,anzahl,zuletzt)
      values(p_person,d,0,'-infinity') on conflict(person) do nothing;
    select * into v from public.rezept_import_nutzung where person=p_person for update;
    if v.zuletzt > t - interval '60 seconds' or (v.tag=d and v.anzahl>=10) then return false; end if;
    update public.rezept_import_nutzung set tag=d,
      anzahl=case when v.tag=d then v.anzahl+1 else 1 end, zuletzt=t where person=p_person;
    return true;
end; $$;
revoke all on function public.rezept_import_limit(uuid) from public, anon, authenticated;
grant execute on function public.rezept_import_limit(uuid) to service_role;

commit;
