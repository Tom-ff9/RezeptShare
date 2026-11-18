begin;
do $$
begin
  if to_regclass('public.rezept_import_nutzung') is null
     or to_regprocedure('public.rezept_import_limit(uuid)') is null then
    raise exception 'Kochbuchimport-Migration fehlt; erst 202611140001 anwenden.';
  end if;
  if to_regclass('public.rezept_import_api_nutzung') is not null then
    raise exception 'rezept_import_api_nutzung existiert bereits; Schema vor Fortsetzung prüfen.';
  end if;
end;
$$;

-- Nur tatsächlich von OpenAI gelieferte Nutzungsdaten; keine Rezept- oder Bildinhalte.
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
