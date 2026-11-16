-- Read-only project audit; run ONLY with the confirmed test-project reference.
-- No user content, key material or auth password hashes are selected.
select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private','storage') and c.relkind='r'
order by n.nspname,c.relname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;

select id,public,file_size_limit,allowed_mime_types from storage.buckets
where id in ('rezeptbilder','profilbilder','rezeptfreigaben') order by id;

select rolname,rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role');

select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig as settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind='f' order by n.nspname,p.proname;

select grantee,table_schema,table_name,privilege_type from information_schema.table_privileges
where table_schema='public' and grantee in ('anon','authenticated','service_role') order by table_name,grantee,privilege_type;

select grantee,routine_name,privilege_type from information_schema.routine_privileges
where routine_schema='public' and routine_name='rezept_import_limit' order by grantee;

select extname,extversion from pg_extension where extname in ('pg_cron','pgcrypto');
