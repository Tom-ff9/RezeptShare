-- DRAFT ONLY: Erst nach bestätigter Produktions-Schemaaufnahme und Freigabe.
-- Additive Erweiterung; verändert weder bestehende Rezepte noch Benutzer/Bilder.
-- Speichert nur tatsächlich vom Responses API zurückgegebene Tokenzahlen, keine Bilder/Texte.
begin;

do $$
begin
  if to_regprocedure('private.konto_aktiv(uuid)') is null or to_regclass('auth.users') is null then
    raise exception 'Voraussetzung fehlt: private.konto_aktiv(uuid). Abbruch ohne Änderungen.';
  end if;
  if to_regclass('public.rezept_import_nutzung') is not null
     or to_regprocedure('public.rezept_import_limit(uuid)') is not null
     or to_regclass('public.rezept_import_api_nutzung') is not null then
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

create table public.rezept_import_api_nutzung (
    id bigint generated always as identity primary key,
    person uuid not null references auth.users(id) on delete cascade,
    openai_response_id text unique,
    model text not null check (length(model) between 1 and 100),
    input_tokens integer not null check (input_tokens >= 0),
    output_tokens integer not null check (output_tokens >= 0),
    total_tokens integer not null check (total_tokens = input_tokens + output_tokens),
    cached_input_tokens integer check (cached_input_tokens is null or cached_input_tokens between 0 and input_tokens),
    reasoning_output_tokens integer check (reasoning_output_tokens is null or reasoning_output_tokens between 0 and output_tokens),
    created_at timestamptz not null default clock_timestamp()
);
create index rezept_import_api_nutzung_person_created_idx
    on public.rezept_import_api_nutzung (person, created_at desc);
alter table public.rezept_import_api_nutzung enable row level security;
revoke all on public.rezept_import_api_nutzung from public, anon, authenticated;
grant select, insert on public.rezept_import_api_nutzung to service_role;
grant usage, select on sequence public.rezept_import_api_nutzung_id_seq to service_role;

commit;
