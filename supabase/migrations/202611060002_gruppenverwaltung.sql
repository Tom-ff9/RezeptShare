-- Nach 202611060001_profile_rollen.sql einmal ausführen.
begin;
alter table public.gruppen add column wird_geloescht boolean not null default false;

create or replace function private.ist_gruppenbesitzer(p_gruppen_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select private.konto_aktiv(auth.uid()) and exists (
 select 1 from public.gruppen_mitglieder gm join public.gruppen g on g.id=gm.gruppen_id
 where gm.gruppen_id=p_gruppen_id and gm.benutzer_id=auth.uid() and gm.rolle='admin' and not g.wird_geloescht);
$$;
create or replace function private.darf_schreiben(p_gruppe bigint,p_person uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select private.konto_aktiv(p_person) and exists (
 select 1 from public.gruppen_mitglieder gm join public.gruppen g on g.id=gm.gruppen_id
 where gm.gruppen_id=p_gruppe and gm.benutzer_id=p_person and gm.rolle in ('admin','mitglied') and not g.wird_geloescht);
$$;

-- Autoren bleiben bei erhaltenen Gruppenrezepten sichtbar, auch nach dem Entfernen aus der Gruppe.
create or replace function private.darf_profil_sehen(p_profil_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid()=p_profil_id or exists (
 select 1 from public.gruppen_mitglieder eigenes join public.gruppen_mitglieder anderes on anderes.gruppen_id=eigenes.gruppen_id
 where eigenes.benutzer_id=auth.uid() and anderes.benutzer_id=p_profil_id)
 or exists(select 1 from public.rezepte r where r.erstellt_von=p_profil_id and private.ist_gruppenmitglied(r.gruppen_id))
 or exists(select 1 from public.rezept_aenderungen a join public.rezepte r on r.id=a.rezept_id
 where a.autor_id=p_profil_id and a.ablauf_am>now() and private.ist_gruppenmitglied(r.gruppen_id));
$$;

create function public.gruppe_einstellungen_speichern(p_gruppe bigint,p_name text,p_nur_ansehen boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_name text := btrim(coalesce(p_name,''));
begin
 perform 1 from public.gruppen where id=p_gruppe and not ist_persoenlich for update;
 if not found or not private.ist_gruppenbesitzer(p_gruppe) then raise exception 'Nur der Admin darf die Gruppe ändern.'; end if;
 if char_length(v_name) not between 1 and 80 then raise exception 'Bitte gib einen Gruppennamen mit 1 bis 80 Zeichen ein.'; end if;
 update public.gruppen set name=v_name,neue_nur_ansehen=p_nur_ansehen where id=p_gruppe;
end; $$;

create function public.mitglied_entfernen(p_gruppe bigint,p_person uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.gruppen where id=p_gruppe and not ist_persoenlich for update;
 if not found or not private.ist_gruppenbesitzer(p_gruppe) or p_person=auth.uid() then
 raise exception 'Du darfst diese Person nicht entfernen.'; end if;
 delete from public.gruppen_mitglieder where gruppen_id=p_gruppe and benutzer_id=p_person and rolle<>'admin';
 if not found then raise exception 'Diese Person ist Admin oder nicht mehr in der Gruppe.'; end if;
 -- Auch noch offene Einladungen an die entfernte Person widerrufen.
 delete from public.einladungen where gruppen_id=p_gruppe and lower(email)=(select lower(email) from auth.users where id=p_person);
end; $$;

-- Nach Beginn der Löschung dürfen keine neuen Rezepte/Bilder/Beitritte entstehen.
create function private.gruppe_schreibbar_pruefen() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_gruppe bigint;
begin
 if tg_table_schema='storage' then
   if new.bucket_id<>'rezeptbilder' then return new; end if;
   v_gruppe:=private.gruppen_id_aus_bildpfad(new.name);
 else v_gruppe:=new.gruppen_id; end if;
 perform 1 from public.gruppen where id=v_gruppe and not wird_geloescht for share;
 if not found then raise exception 'Die Gruppe wird gelöscht oder ist nicht mehr vorhanden.'; end if;
 return new;
end; $$;
create trigger gruppenstatus_rezept before insert or update on public.rezepte for each row execute function private.gruppe_schreibbar_pruefen();
create trigger gruppenstatus_mitglied before insert or update on public.gruppen_mitglieder for each row execute function private.gruppe_schreibbar_pruefen();
create trigger gruppenstatus_bild before insert on storage.objects for each row execute function private.gruppe_schreibbar_pruefen();

-- Nur Edge Function: Identität wird dort mit auth.getUser geprüft, anschließend hier unter Sperre autorisiert.
create function public.gruppe_loeschung_vorbereiten(p_person uuid,p_gruppe bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare g public.gruppen;
begin
 perform 1 from public.profile where id=p_person and not wird_geloescht for share;
 if not found then raise exception 'Das Konto ist nicht aktiv.'; end if;
 select * into g from public.gruppen where id=p_gruppe for update;
 if not found then return false; end if;
 if g.ist_persoenlich or not exists(select 1 from public.gruppen_mitglieder where gruppen_id=p_gruppe and benutzer_id=p_person and rolle='admin') then
 raise exception 'Nur der Admin kann eine gemeinsame Gruppe löschen.'; end if;
 update public.gruppen set wird_geloescht=true where id=p_gruppe;
 return true;
end; $$;
create function public.gruppe_loeschdateien(p_person uuid,p_gruppe bigint) returns table(name text)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.gruppen g join public.gruppen_mitglieder gm on gm.gruppen_id=g.id
 where g.id=p_gruppe and g.wird_geloescht and gm.benutzer_id=p_person and gm.rolle='admin') then
 raise exception 'Keine vorbereitete Gruppenlöschung gefunden.'; end if;
 return query select o.name from storage.objects o where o.bucket_id='rezeptbilder'
 and private.gruppen_id_aus_bildpfad(o.name)=p_gruppe order by o.name limit 100;
end; $$;
create function public.gruppe_loeschung_abschliessen(p_person uuid,p_gruppe bigint) returns void
language plpgsql security definer set search_path='' as $$
declare g public.gruppen;
begin
 select * into g from public.gruppen where id=p_gruppe for update;
 if not found then return; end if;
 if g.ist_persoenlich or not g.wird_geloescht or not exists(select 1 from public.gruppen_mitglieder
 where gruppen_id=p_gruppe and benutzer_id=p_person and rolle='admin') then raise exception 'Gruppenlöschung nicht erlaubt.'; end if;
 if exists(select 1 from storage.objects where bucket_id='rezeptbilder' and private.gruppen_id_aus_bildpfad(name)=p_gruppe) then
 raise exception 'Es sind noch Gruppenbilder vorhanden. Bitte erneut versuchen.'; end if;
 delete from public.gruppen where id=p_gruppe;
end; $$;
revoke all on function private.gruppe_schreibbar_pruefen() from public,anon,authenticated;
revoke all on function public.gruppe_einstellungen_speichern(bigint,text,boolean),public.mitglied_entfernen(bigint,uuid) from public,anon;
grant execute on function public.gruppe_einstellungen_speichern(bigint,text,boolean),public.mitglied_entfernen(bigint,uuid) to authenticated;
revoke all on function public.gruppe_loeschung_vorbereiten(uuid,bigint),public.gruppe_loeschdateien(uuid,bigint),public.gruppe_loeschung_abschliessen(uuid,bigint) from public,anon,authenticated;
grant execute on function public.gruppe_loeschung_vorbereiten(uuid,bigint),public.gruppe_loeschdateien(uuid,bigint),public.gruppe_loeschung_abschliessen(uuid,bigint) to service_role;
commit;
