-- Read-only schema inventory for Tom's existing Supabase project.
-- Safe for SQL Editor / `supabase db query --read-only`; returns metadata only.
select current_database() as database_name, current_setting('server_version') as postgres_version,
       to_regclass('auth.users') is not null as auth_users_exists,
       to_regclass('public.profile') is not null as profile_exists,
       to_regprocedure('private.konto_aktiv(uuid)') is not null as active_account_function_exists,
       to_regclass('supabase_migrations.schema_migrations') is not null as migration_history_exists;

select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema in ('public','private','storage')
  and table_name in (
    'profile','gruppen','gruppen_mitglieder','rezepte','einladungen',
    'rezept_aenderungen','ausgeblendete_aenderungen','rezept_freigaben',
    'rezept_auftraege','rezept_import_nutzung','rezept_import_api_nutzung','ki_assistent_nutzung',
    'buckets','objects'
  )
order by table_schema, table_name, ordinal_position;

select n.nspname as function_schema, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig as function_settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private')
order by n.nspname, p.proname, arguments;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

select trigger_schema, event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where trigger_schema in ('public','storage')
order by trigger_schema, event_object_table, trigger_name;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select to_regclass('supabase_migrations.schema_migrations') as migration_history_table,
       case when to_regclass('supabase_migrations.schema_migrations') is null then null
         else query_to_xml(
           'select version, name from supabase_migrations.schema_migrations order by version',
           false, true, ''
         ) end as migration_versions_xml;
