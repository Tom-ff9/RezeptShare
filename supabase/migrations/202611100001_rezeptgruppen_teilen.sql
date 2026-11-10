-- Unabhängige Gruppenkopien und öffentliche, unveränderliche Rezeptstände.
begin;
alter table public.rezepte add column familie_id uuid not null default gen_random_uuid();
alter table public.rezepte add column geteilt_von text;
create unique index rezepte_familie_gruppe on public.rezepte(familie_id,gruppen_id);
-- Eine Familie kann nur durch die geprüften Serverfunktionen verbunden werden.
revoke insert on public.rezepte from authenticated;
grant insert(gruppen_id,erstellt_von,name,text,bild_pfad,kalorien,protein,kohlenhydrate,fett) on public.rezepte to authenticated;

create table public.rezept_freigaben (
 token uuid primary key,
 familie_id uuid not null,
 quell_id bigint not null,
 quell_version integer not null,
 erstellt_von uuid not null references public.profile(id) on delete cascade,
 anzeigename text not null,
 daten jsonb not null,
 bild_pfad text,
 erstellt_am timestamptz not null default now(),
 unique(erstellt_von,quell_id,quell_version)
);
create table public.rezept_auftraege (
 id uuid primary key,
 person uuid not null references public.profile(id) on delete cascade,
 ergebnis jsonb not null,
 erstellt_am timestamptz not null default now()
);
alter table public.rezept_freigaben enable row level security;
alter table public.rezept_auftraege enable row level security;
revoke all on public.rezept_freigaben,public.rezept_auftraege from public,anon,authenticated;
grant all on public.rezept_freigaben,public.rezept_auftraege to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('rezeptfreigaben','rezeptfreigaben',false,5242880,array['image/jpeg','image/png','image/webp']);

create function public.rezept_gruppen_anwenden(
 p_person uuid,p_auftrag uuid,p_modus text,p_id bigint,p_version integer,p_token uuid,
 p_gruppen bigint[],p_entfernen jsonb,p_daten jsonb,p_bilder jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rezepte; s public.rezept_freigaben; f uuid; d jsonb; g bigint; x record;
 bild text; herkunft text; result jsonb; geloescht jsonb := '[]';
begin
 perform 1 from public.profile where id=p_person and not wird_geloescht for share;
 if not found then raise exception 'Das Konto ist nicht aktiv.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_auftrag::text,0));
 select ergebnis into result from public.rezept_auftraege where id=p_auftrag and person=p_person;
 if found then return result; end if;
 if exists(select 1 from public.rezept_auftraege where id=p_auftrag) then raise exception 'Ungültiger Auftrag.'; end if;
 if p_modus not in ('erstellen','zuordnen','uebernehmen') or p_modus is null or p_gruppen is null
 or cardinality(p_gruppen)>100 or jsonb_typeof(p_entfernen) is distinct from 'array' then raise exception 'Ungültige Gruppenauswahl.'; end if;
 if p_modus<>'zuordnen' and cardinality(p_gruppen)=0 then raise exception 'Bitte wähle mindestens eine Gruppe.'; end if;
 if p_modus='zuordnen' then
  select * into r from public.rezepte where id=p_id;
  if not found then raise exception 'Das Rezept ist nicht mehr verfügbar.'; end if;
  f:=r.familie_id;
 elsif p_modus='uebernehmen' then
  select * into s from public.rezept_freigaben where token=p_token for share;
  if not found or not private.konto_aktiv(s.erstellt_von) then raise exception 'Dieser Rezeptlink ist nicht mehr verfügbar.'; end if;
  f:=s.familie_id; d:=s.daten; herkunft:=s.anzeigename;
 else f:=gen_random_uuid(); d:=p_daten;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(f::text,1));
 -- Gleiche Sperrreihenfolge wie Gruppenverwaltung und Rezeptbearbeitung.
 perform 1 from public.gruppen where id in (
  select unnest(p_gruppen) union select (v->>'gruppen_id')::bigint from jsonb_array_elements(p_entfernen) v
  union select r.gruppen_id where p_modus='zuordnen'
 ) order by id for update;
 if p_modus='zuordnen' then
  select * into r from public.rezepte where id=p_id for update;
  if not found or not exists(select 1 from public.gruppen_mitglieder where gruppen_id=r.gruppen_id and benutzer_id=p_person)
  or exists(select 1 from public.gruppen where id=r.gruppen_id and wird_geloescht) then raise exception 'Kein Zugriff auf dieses Rezept.'; end if;
  if r.version is distinct from p_version then raise exception 'Das Rezept wurde inzwischen geändert. Bitte lade es neu.'; end if;
  d:=to_jsonb(r); herkunft:=r.geteilt_von;
 end if;
 if p_modus<>'zuordnen' and jsonb_array_length(p_entfernen)>0 then raise exception 'Entfernen ist hier nicht erlaubt.'; end if;
 for x in select * from jsonb_to_recordset(p_entfernen) as t(id bigint,gruppen_id bigint,version integer) loop
  if x.gruppen_id=any(p_gruppen) then raise exception 'Widersprüchliche Gruppenauswahl.'; end if;
  if not exists(select 1 from public.rezepte q where q.id=x.id and q.gruppen_id=x.gruppen_id and q.familie_id=f and q.version=x.version
    and private.darf_schreiben(q.gruppen_id,p_person)
    and (q.erstellt_von=p_person or exists(select 1 from public.gruppen_mitglieder where gruppen_id=q.gruppen_id and benutzer_id=p_person and rolle='admin')))
  then raise exception 'Eine Kopie wurde geändert oder darf nicht gelöscht werden. Bitte lade neu.'; end if;
 end loop;
 for g in select distinct unnest(p_gruppen) loop
  if not exists(select 1 from public.gruppen_mitglieder gm join public.gruppen gr on gr.id=gm.gruppen_id
    where gm.gruppen_id=g and gm.benutzer_id=p_person and not gr.wird_geloescht) then raise exception 'Kein Zugriff auf eine Zielgruppe.'; end if;
  if exists(select 1 from public.rezepte where familie_id=f and gruppen_id=g) then continue; end if;
  if not private.darf_schreiben(g,p_person) then raise exception 'Keine Schreibrechte in einer Zielgruppe.'; end if;
  bild:=p_bilder->>g::text;
  if d->>'bild_pfad' is not null and bild is null then raise exception 'Das Rezeptbild fehlt.'; end if;
  if bild is not null and not exists(select 1 from storage.objects where bucket_id='rezeptbilder' and name=bild and private.gruppen_id_aus_bildpfad(name)=g)
    then raise exception 'Ungültiges Zielbild.'; end if;
  insert into public.rezepte(gruppen_id,erstellt_von,familie_id,geteilt_von,name,text,bild_pfad,kalorien,protein,kohlenhydrate,fett)
  values(g,p_person,f,herkunft,d->>'name',d->>'text',bild,(d->>'kalorien')::numeric,(d->>'protein')::numeric,(d->>'kohlenhydrate')::numeric,(d->>'fett')::numeric);
 end loop;
 select coalesce(jsonb_agg(q.bild_pfad) filter(where q.bild_pfad is not null),'[]') into geloescht
 from public.rezepte q where q.id in(select (v->>'id')::bigint from jsonb_array_elements(p_entfernen) v);
 delete from public.rezepte where id in(select (v->>'id')::bigint from jsonb_array_elements(p_entfernen) v);
 select jsonb_build_object('kopien',coalesce(jsonb_agg(jsonb_build_object('id',q.id,'gruppen_id',q.gruppen_id,'version',q.version,'erstellt_von',q.erstellt_von)),'[]'),
   'entfernte_bilder',geloescht) into result from public.rezepte q
 where q.familie_id=f and exists(select 1 from public.gruppen_mitglieder where gruppen_id=q.gruppen_id and benutzer_id=p_person);
 insert into public.rezept_auftraege(id,person,ergebnis) values(p_auftrag,p_person,result);
 return result;
end; $$;

create function public.rezept_freigabe_erstellen(p_person uuid,p_id bigint,p_version integer,p_token uuid,p_bild text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rezepte; token_alt uuid; n text; g bigint;
begin
 select anzeigename into n from public.profile where id=p_person and not wird_geloescht for share;
 if not found then raise exception 'Das Konto ist nicht aktiv.'; end if;
 select gruppen_id into g from public.rezepte where id=p_id;
 perform 1 from public.gruppen where id=g and not wird_geloescht for update;
 if not found then raise exception 'Das Rezept ist nicht verfügbar.'; end if;
 select * into r from public.rezepte where id=p_id for share;
 if not found or not exists(select 1 from public.gruppen_mitglieder where gruppen_id=g and benutzer_id=p_person) then raise exception 'Kein Zugriff auf dieses Rezept.'; end if;
 if r.version is distinct from p_version then raise exception 'Das Rezept wurde inzwischen geändert. Bitte lade es neu.'; end if;
 select token into token_alt from public.rezept_freigaben where erstellt_von=p_person and quell_id=p_id and quell_version=p_version;
 if found then return token_alt; end if;
 if (r.bild_pfad is null) is distinct from (p_bild is null) or (p_bild is not null and not exists(
  select 1 from storage.objects where bucket_id='rezeptfreigaben' and name=p_bild and name=p_person::text||'/'||p_token::text)) then raise exception 'Das Freigabebild fehlt.'; end if;
 insert into public.rezept_freigaben(token,familie_id,quell_id,quell_version,erstellt_von,anzeigename,daten,bild_pfad)
 values(p_token,r.familie_id,p_id,p_version,p_person,n,
  jsonb_build_object('name',r.name,'text',r.text,'kalorien',r.kalorien,'protein',r.protein,'kohlenhydrate',r.kohlenhydrate,'fett',r.fett,'bild_pfad',p_bild),p_bild);
 return p_token;
end; $$;

-- Freigaben und ihre Bilder gehören dem teilenden Account, nicht der Quellgruppe.
alter function public.konto_dateien_vorbereiten(uuid) rename to konto_dateien_vor_gruppen;
create function public.konto_dateien_vorbereiten(p_person uuid) returns table(bucket_id text,name text)
language plpgsql security definer set search_path='' as $$
begin
 return query select * from public.konto_dateien_vor_gruppen(p_person);
 return query select o.bucket_id,o.name from storage.objects o where o.bucket_id='rezeptfreigaben' and split_part(o.name,'/',1)=p_person::text;
end; $$;
alter function public.konto_daten_entfernen(uuid) rename to konto_daten_vor_gruppen;
create function public.konto_daten_entfernen(p_person uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.konto_daten_vor_gruppen(p_person);
 delete from public.rezept_freigaben where erstellt_von=p_person;
end; $$;
revoke all on function public.rezept_gruppen_anwenden(uuid,uuid,text,bigint,integer,uuid,bigint[],jsonb,jsonb,jsonb),public.rezept_freigabe_erstellen(uuid,bigint,integer,uuid,text),public.konto_dateien_vorbereiten(uuid),public.konto_daten_entfernen(uuid) from public,anon,authenticated;
grant execute on function public.rezept_gruppen_anwenden(uuid,uuid,text,bigint,integer,uuid,bigint[],jsonb,jsonb,jsonb),public.rezept_freigabe_erstellen(uuid,bigint,integer,uuid,text),public.konto_dateien_vorbereiten(uuid),public.konto_daten_entfernen(uuid) to service_role;
commit;
