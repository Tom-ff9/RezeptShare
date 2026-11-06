function rollenName(rolle) {
    return { admin: 'Admin', mitglied: 'Mitglied', beobachter: 'Beobachter' }[rolle] || rolle;
}
function gruppenDialog(titel) {
    const dialog = elementErstellen('dialog', 'dialog bestaetigungs-dialog gruppen-dialog');
    const heading = elementErstellen('h2', null, titel);
    heading.id = 'dialog-' + crypto.randomUUID(); dialog.setAttribute('aria-labelledby', heading.id);
    const close = elementErstellen('button', 'dialog-schliessen', '×'); close.type = 'button';
    close.setAttribute('aria-label', titel + ' schließen'); close.addEventListener('click', () => dialog.close());
    const body = elementErstellen('div');
    const message = elementErstellen('p', 'fehlermeldung'); message.setAttribute('aria-live', 'polite');
    dialog.append(close, heading, body, message); document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
    return { dialog, body, message };
}
function zahnradButton(gruppe) {
    const button = elementErstellen('button', 'gruppen-zahnrad'); button.type = 'button';
    button.setAttribute('aria-label', 'Einstellungen für ' + gruppe.name); button.title = 'Gruppeneinstellungen';
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M9.5 3h5l.6 2.5 2 .9 2.3-.7 2.5 4.3-1.8 1.8v2.3l1.8 1.8-2.5 4.3-2.3-.7-2 .9-.6 2.5h-5l-.6-2.5-2-.9-2.3.7L2.1 16l1.8-1.8v-2.3L2.1 10l2.5-4.3 2.3.7 2-.9Z');
    // Zentrierung auf dem 24er Raster.
    path.setAttribute('transform', 'translate(0 -1)');
    const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx','12'); circle.setAttribute('cy','12'); circle.setAttribute('r','3.3');
    svg.append(path,circle); button.append(svg);
    button.addEventListener('click', () => gruppenEinstellungenOeffnen(gruppe)); return button;
}
function gruppenElementErstellen(gruppe) {
    const artikel = elementErstellen('article', 'gruppen-eintrag'); artikel.dataset.gruppe = gruppe.id;
    const header = elementErstellen('div', 'gruppen-kartenkopf');
    const kopf = elementErstellen('button', 'gruppen-eintrag-kopf'); kopf.type='button';
    kopf.setAttribute('aria-expanded','false'); kopf.setAttribute('aria-controls','gruppe-details-'+gruppe.id);
    const title = elementErstellen('span', 'gruppen-titel-bereich'); title.append(elementErstellen('strong',null,gruppe.name));
    kopf.append(title,elementErstellen('span','accordion-pfeil','⌄'));
    const gear = zahnradButton(gruppe); gear.hidden=true;
    const details = elementErstellen('div','gruppen-details'); details.id='gruppe-details-'+gruppe.id; details.hidden=true;
    kopf.addEventListener('click',async()=>{
        const open=details.hidden; details.hidden=!open; kopf.setAttribute('aria-expanded',String(open));
        gear.hidden=!open || gruppe.rolle!=='admin' || gruppe.istPersoenlich;
        if(open) {
            details.textContent='Wird geladen …';
            try { const data=await gruppenDetailsLaden(gruppe); if(!details.hidden) gruppenDetailsAnzeigen(details,data); }
            catch(e) { details.textContent=e.message; }
        }
    });
    header.append(kopf,gear); artikel.append(header,details); return artikel;
}
function gruppenDetailsAnzeigen(container, gruppe) {
    container.replaceChildren();
    const stats=elementErstellen('div','gruppen-statistik');
    if(gruppe.rolle==='admin' && !gruppe.istPersoenlich) {
        const invite=elementErstellen('button','mitglied-hinzufuegen','+'); invite.type='button';
        invite.setAttribute('aria-label','Mitglied hinzufügen'); invite.title='Mitglied hinzufügen';
        invite.addEventListener('click',()=>einladungDialogOeffnen(gruppe)); stats.append(invite);
    }
    stats.append(elementErstellen('span','gruppen-zaehler',gruppe.mitglieder.length+' '+(gruppe.mitglieder.length===1?'Mitglied':'Mitglieder')),
        elementErstellen('span','gruppen-statistik-trenner','|'), elementErstellen('span','gruppen-zaehler',gruppe.rezepteAnzahl+' '+(gruppe.rezepteAnzahl===1?'Rezept':'Rezepte')));
    if(gruppe.istPersoenlich) stats.append(elementErstellen('span','gruppen-statistik-trenner','|'),elementErstellen('span','gruppen-zaehler','Privat'));
    const list=elementErstellen('ul','mitglieder-liste');
    for(const person of gruppe.mitglieder) {
        const li=elementErstellen('li'); const button=elementErstellen('button','mitglied-profil-button'); button.type='button';
        const name=person.anzeigename+(person.id===aktiverBenutzer.id?' (Du)':'');
        const identity=elementErstellen('span','mitglied-identitaet');
        const avatar=document.createElement('img'); avatar.className='profilbild'; avatar.alt=''; avatar.src=STANDARD_PROFILBILD;
        avatar.addEventListener('error',()=>{avatar.src=STANDARD_PROFILBILD;},{once:true});
        identity.append(avatar,elementErstellen('span','mitglied-name',name));
        button.append(identity,elementErstellen('small',null,rollenName(person.rolle)));
        if(person.bildPfad) {
            profilBildUrl(person.bildPfad).then(url=>{avatar.src=url;}).catch(()=>{avatar.src=STANDARD_PROFILBILD;});
        }
        button.setAttribute('aria-label','Profil von '+name+' öffnen');
        button.addEventListener('click',()=>mitgliedProfilOeffnen(gruppe,person)); li.append(button); list.append(li);
    }
    container.append(stats,list);
}
async function gruppenNachAktionLaden(id) {
    await gruppenLaden(aktiveGruppenId);
    document.querySelector('[data-gruppe="'+id+'"] .gruppen-eintrag-kopf')?.click();
}
function gruppenEinstellungenOeffnen(gruppe) {
    const {dialog,body,message}=gruppenDialog('Gruppeneinstellungen');
    const form=elementErstellen('form');
    const nameLabel=elementErstellen('label',null,'Gruppenname');
    const name=document.createElement('input'); name.type='text'; name.required=true; name.maxLength=80; name.value=gruppe.name; nameLabel.append(name);
    const toggleLabel=elementErstellen('label','toggle-zeile');
    const toggle=document.createElement('input'); toggle.type='checkbox'; toggle.setAttribute('role','switch'); toggle.checked=gruppe.neueNurAnsehen;
    toggleLabel.append(elementErstellen('span',null,'Neue Mitglieder dürfen nur Rezepte ansehen'),toggle);
    const save=elementErstellen('button','primaer-button','Speichern'); save.type='submit';
    form.append(nameLabel,toggleLabel,elementErstellen('small',null,'Gilt nur für künftige Beitritte. Bestehende Rollen bleiben unverändert.'),save);
    form.addEventListener('submit',async event=>{
        event.preventDefault(); save.disabled=true; message.textContent='';
        try {
            datenAusErgebnis(await supabaseClient.rpc('gruppe_einstellungen_speichern',{p_gruppe:gruppe.id,p_name:name.value.trim(),p_nur_ansehen:toggle.checked}));
            await gruppenNachAktionLaden(gruppe.id); dialog.close();
        } catch(e) { message.textContent=e.message; } finally {save.disabled=false;}
    });
    const remove=elementErstellen('button','gefahr-button gruppen-loeschen-button','Gruppe löschen'); remove.type='button';
    remove.addEventListener('click',async()=>{
        if(!await bestaetigungFragen('Gruppe dauerhaft löschen?','„'+gruppe.name+'“ wird mit allen Rezepten, Bildern und Einladungen für alle Personen gelöscht. Das kann nicht rückgängig gemacht werden.','Gruppe löschen',true)) return;
        remove.disabled=true; save.disabled=true; message.textContent='Gruppe wird gelöscht …';
        try {
            await serverFunktion('gruppe-loeschen',{gruppen_id:gruppe.id,bestaetigt:true});
            await gruppenLaden(aktiveGruppenId); dialog.close();
        } catch(e) { message.textContent=e.message+' Du kannst die Löschung erneut versuchen.'; }
        finally {remove.disabled=false;save.disabled=false;}
    });
    body.append(form,remove);
}
function einladungDialogOeffnen(gruppe) {
    const {body,message}=gruppenDialog('Mitglied hinzufügen');
    body.append(elementErstellen('p','gruppen-meta','Einladung zu „'+gruppe.name+'“'));
    const form=elementErstellen('form'); const label=elementErstellen('label',null,'E-Mail-Adresse');
    const email=document.createElement('input'); email.type='email'; email.required=true; email.autocomplete='email'; email.placeholder='name@beispiel.de'; label.append(email);
    const button=elementErstellen('button',null,'Link erstellen'); button.type='submit';
    const output=elementErstellen('div','einladungs-ausgabe'); form.append(label,button); body.append(form,output);
    form.addEventListener('submit',async event=>{
        event.preventDefault(); button.disabled=true; message.textContent=''; output.replaceChildren();
        try {
            const data=datenAusErgebnis(await supabaseClient.rpc('einladung_erstellen',{p_gruppen_id:gruppe.id,p_email:email.value.trim()}));
            const link=document.createElement('input'); link.readOnly=true; link.value=einladungsLinkErstellen(data[0].token); link.setAttribute('aria-label','Einladungslink');
            const copy=elementErstellen('button','sekundaer-button','Link kopieren'); copy.type='button';
            copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.value);copy.textContent='Kopiert';}catch{link.select();}});
            output.append(elementErstellen('p',null,'Der Link ist 7 Tage gültig. Schicke ihn an die eingeladene Person.'),link,copy);
        } catch(e) {message.textContent=e.message;} finally{button.disabled=false;}
    });
}
async function mitgliedProfilOeffnen(gruppe, person) {
    const {dialog,body,message}=gruppenDialog('Mitgliederprofil'); body.textContent='Wird geladen …';
    try {
        const membership=datenAusErgebnis(await supabaseClient.from('gruppen_mitglieder')
            .select('rolle, profil:profile!gruppen_mitglieder_benutzer_id_fkey(id, anzeigename, bild_pfad)')
            .eq('gruppen_id',gruppe.id).eq('benutzer_id',person.id).single());
        const profile=verknuepftesObjekt(membership.profil);
        const count=await supabaseClient.from('rezepte').select('id',{count:'exact',head:true}).eq('gruppen_id',gruppe.id).eq('erstellt_von',person.id);
        datenAusErgebnis(count);
        const url=await profilBildUrl(profile.bild_pfad);
        if(!dialog.open) return;
        body.replaceChildren(); const image=document.createElement('img'); image.className='profilbild profilbild-gross'; image.src=url; image.alt='Profilbild von '+profile.anzeigename;
        image.addEventListener('error',()=>{image.src=STANDARD_PROFILBILD;},{once:true});
        const name=profile.anzeigename+(person.id===aktiverBenutzer.id?' (Du)':'');
        body.append(image,elementErstellen('h3','mitglied-profil-name',name),elementErstellen('p','mitglied-profil-rolle',rollenName(membership.rolle)),
            elementErstellen('p','mitglied-profil-anzahl',(count.count||0)+' '+(count.count===1?'hinzugefügtes Rezept':'hinzugefügte Rezepte')+' in dieser Gruppe'));
        if(gruppe.rolle!=='admin' || gruppe.istPersoenlich || person.id===aktiverBenutzer.id || membership.rolle==='admin') return;
        const actions=elementErstellen('div','mitglied-profil-aktionen');
        async function action(run) {
            actions.querySelectorAll('button').forEach(b=>{b.disabled=true;}); message.textContent='';
            try {await run();await gruppenNachAktionLaden(gruppe.id);dialog.close();}
            catch(e){message.textContent=e.message;actions.querySelectorAll('button').forEach(b=>{b.disabled=false;});}
        }
        const role=membership.rolle==='beobachter'?'mitglied':'beobachter';
        const change=elementErstellen('button',null,role==='mitglied'?'Zum Mitglied befördern':'Zum Beobachter machen'); change.type='button';
        change.addEventListener('click',()=>action(async()=>datenAusErgebnis(await supabaseClient.rpc('mitglied_rolle',{p_gruppe:gruppe.id,p_person:person.id,p_rolle:role}))));
        const transfer=elementErstellen('button','sekundaer-button','Admin übertragen'); transfer.type='button';
        transfer.addEventListener('click',async()=>{
            if(await bestaetigungFragen('Adminrolle übertragen?',profile.anzeigename+' wird Admin. Du wirst Mitglied.','Übertragen'))
                await action(async()=>datenAusErgebnis(await supabaseClient.rpc('admin_uebertragen',{p_gruppe:gruppe.id,p_person:person.id})));
        });
        const kick=elementErstellen('button','gefahr-button','Aus Gruppe entfernen'); kick.type='button';
        kick.addEventListener('click',async()=>{
            if(await bestaetigungFragen('Person entfernen?',profile.anzeigename+' verliert den Zugriff auf diese Gruppe. Hinzugefügte Rezepte bleiben erhalten.','Entfernen',true))
                await action(async()=>datenAusErgebnis(await supabaseClient.rpc('mitglied_entfernen',{p_gruppe:gruppe.id,p_person:person.id})));
        });
        actions.append(change,transfer,kick); body.append(actions);
    } catch(e) {body.replaceChildren();message.textContent='Das Profil konnte nicht geladen werden: '+e.message;}
}
