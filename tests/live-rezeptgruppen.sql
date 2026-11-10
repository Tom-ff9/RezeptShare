-- Im Supabase SQL Editor ausführen. Alle Testkonten und -rezepte werden zurückgerollt.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ga bigint; gb bigint; team bigint;
 r bigint; c bigint; imported bigint; v_token uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); result jsonb; wiederholt jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,'recipe-test-'||a::text||'@example.invalid','{"anzeigename":"Rezepttest A"}'),
 (b,'recipe-test-'||b::text||'@example.invalid','{"anzeigename":"Rezepttest B"}');
 perform set_config('request.jwt.claim.sub',a::text,true);
 select id into ga from public.gruppen where ist_persoenlich and erstellt_von=a;
 select id into gb from public.gruppen where ist_persoenlich and erstellt_von=b;
 team:=public.gruppe_erstellen('Temporäre Rezepttest-Gruppe');
 insert into public.rezepte(gruppen_id,erstellt_von,name,text) values(ga,a,'Transaktionstest','Originalstand') returning id into r;
 result:=public.rezept_gruppen_anwenden(a,op,'zuordnen',r,1,null,array[ga,team],'[]',null,'{}');
 assert jsonb_array_length(result->'kopien')=2,'Mehrfachzuordnung fehlt';
 wiederholt:=public.rezept_gruppen_anwenden(a,op,'zuordnen',r,1,null,array[ga,team],'[]',null,'{}');
 assert result=wiederholt,'Wiederholung erzeugt andere Kopien';
 select id into c from public.rezepte where gruppen_id=team and familie_id=(select familie_id from public.rezepte where id=r);
 perform public.rezept_freigabe_erstellen(a,r,1,v_token,null);
 begin
  perform public.rezept_gruppen_anwenden(b,gen_random_uuid(),'zuordnen',r,1,null,array[gb],'[]',null,'{}');
  raise exception 'Fremder Quellzugriff war möglich';
 exception when raise_exception then
  if sqlerrm='Fremder Quellzugriff war möglich' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 result:=public.rezept_gruppen_anwenden(b,gen_random_uuid(),'uebernehmen',null,null,v_token,array[gb],'[]',null,'{}');
 imported:=(result->'kopien'->0->>'id')::bigint;
 assert (select geteilt_von='Rezepttest A' from public.rezepte where id=imported),'Herkunft fehlt';
 perform public.rezept_gruppen_anwenden(b,gen_random_uuid(),'uebernehmen',null,null,v_token,array[gb],'[]',null,'{}');
 assert (select count(*)=1 from public.rezepte where gruppen_id=gb),'Doppelter Import';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.rezept_speichern_intern(a,r,1,'{"name":"Transaktionstest","text":"Geänderter Stand","bild_pfad":null}','[]');
 assert (select text='Originalstand' from public.rezepte where id=c),'Kopie wurde mitverändert';
 assert (select daten->>'text'='Originalstand' from public.rezept_freigaben where rezept_freigaben.token=v_token),'Freigabe wurde mitverändert';
 perform public.rezept_gruppen_anwenden(a,gen_random_uuid(),'zuordnen',r,2,null,array[team],jsonb_build_array(jsonb_build_object('id',r,'gruppen_id',ga,'version',2)),null,'{}');
 assert not exists(select 1 from public.rezepte where id=r),'Abwahl entfernt Kopie nicht';
 assert (select text='Originalstand' from public.rezepte where id=imported),'Import wurde mitgelöscht';
 assert exists(select 1 from public.rezept_freigaben where rezept_freigaben.token=v_token),'Freigabe wurde mitgelöscht';
end; $$;
rollback;
select 'Live-Transaktionstest erfolgreich; Testkonten und Rezepte zurückgerollt.' as ergebnis;
