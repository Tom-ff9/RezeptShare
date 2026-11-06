// Ergänzungen für Profile, Gruppenrechte und befristete Änderungshinweise.
const STANDARD_PROFILBILD = 'assets/profil-standard.svg';
let profilOnboarding = false;
let profilObjektUrl = null;
let aenderungsTimer = null;

function darfRezepteBearbeiten(gruppenId = aktiveGruppenId) {
    return !aktiverBenutzer?.wirdGeloescht && ['admin', 'mitglied'].includes(gruppen.find(g => g.id === gruppenId)?.rolle);
}
function darfRezeptLoeschen(rezept) {
    return darfRezepteBearbeiten(rezept.gruppenId) && (gruppen.find(g => g.id === rezept.gruppenId)?.rolle === 'admin' || rezept.ersteller.id === aktiverBenutzer.id);
}
function darfRezeptHinzufuegen() {
    return aktiveAnsicht === 'rezepte' && alleGruppenAnzeigen
        ? gruppen.some(g => darfRezepteBearbeiten(g.id)) : darfRezepteBearbeiten();
}
function rechteAnzeigen() {
    document.querySelector('[data-ansicht="hinzufuegen"]').hidden = !darfRezeptHinzufuegen();
    if (!darfRezepteBearbeiten() && aktiveAnsicht === 'hinzufuegen') ansichtAnzeigen('rezepte');
}
async function serverFunktion(name, body) {
    const result = await supabaseClient.functions.invoke(name, { body });
    if (result.error) {
        let message = result.error.message;
        try { message = (await result.error.context.json()).error || message; } catch { /* Netzwerkfehler ohne JSON */ }
        throw new Error(message);
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
}
async function profilBildUrl(pfad) {
    if (!pfad) return STANDARD_PROFILBILD;
    const result = await supabaseClient.storage.from('profilbilder').createSignedUrl(pfad, 3600);
    return result.data?.signedUrl || STANDARD_PROFILBILD;
}
async function kopfProfilbildLaden() {
    document.querySelector('#kopf-profilbild').src = await profilBildUrl(aktiverBenutzer.bildPfad);
}
async function profilOeffnen(onboarding = false) {
    profilOnboarding = onboarding;
    profilFormular.reset();
    profilMeldung.textContent = '';
    document.querySelector('#profil-name').value = aktiverBenutzer.anzeigename;
    document.querySelector('#profil-titel').textContent = onboarding ? 'Dein Profilbild' : 'Accounteinstellungen';
    document.querySelector('#profil-hinweis').textContent = aktiverBenutzer.wirdGeloescht
        ? 'Deine Kontolöschung wurde begonnen. Bitte setze sie über „Konto löschen“ fort.'
        : onboarding ? 'Wähle ein Foto aus oder lege es später fest.' : '';
    document.querySelector('#profil-hinweis').hidden = !onboarding && !aktiverBenutzer.wirdGeloescht;
    document.querySelector('#profil-spaeter').hidden = !onboarding;
    document.querySelector('#profil-schliessen').hidden = onboarding || aktiverBenutzer.wirdGeloescht;
    document.querySelector('#konto-loeschen-oeffnen').hidden = onboarding;
    document.querySelector('#profil-abbrechen').hidden = onboarding || aktiverBenutzer.wirdGeloescht;
    document.querySelector('#profil-vorschau').src = await profilBildUrl(aktiverBenutzer.bildPfad);
    profilAuswahl.hidden = true;
    profilButton.setAttribute('aria-expanded', 'false');
    if (!profilDialog.open) profilDialog.showModal();
}
async function profilSpeichern(spaeter = false) {
    const buttons = profilDialog.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    profilMeldung.textContent = '';
    let uploaded = null;
    const old = aktiverBenutzer.bildPfad;
    try {
        const name = document.querySelector('#profil-name').value.trim();
        if (!name || name.length > 60) throw new Error('Bitte gib einen Namen mit höchstens 60 Zeichen ein.');
        const file = spaeter ? null : document.querySelector('#profil-datei').files[0];
        if (profilOnboarding && !spaeter && !file) throw new Error('Bitte wähle ein Foto oder „später festlegen“.');
        if (file) {
            bildDateiPruefen(file);
            const decoded = await createImageBitmap(file); decoded.close();
            const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
            uploaded = aktiverBenutzer.id + '/' + crypto.randomUUID() + '.' + ext;
            datenAusErgebnis(await supabaseClient.storage.from('profilbilder').upload(uploaded, file, { contentType: file.type, upsert: false }));
        }
        const path = uploaded || old;
        datenAusErgebnis(await supabaseClient.from('profile').update({ anzeigename: name, bild_pfad: path, profilbild_festgelegt: true })
            .eq('id', aktiverBenutzer.id).select('id').single());
        aktiverBenutzer.anzeigename = name;
        aktiverBenutzer.bildPfad = path;
        aktiverBenutzer.profilbildFestgelegt = true;
        if (old && old !== path) {
            const cleanup = await supabaseClient.storage.from('profilbilder').remove([old]);
            if (cleanup.error) console.warn('Das alte Profilfoto konnte nicht entfernt werden:', cleanup.error.message);
        }
        await kopfProfilbildLaden();
        benutzerName.textContent = name;
        profilDialog.close();
        if (profilOnboarding) await angemeldeteAppLaden();
        else { await rezepteLaden(); if (aktiveAnsicht === "gruppen") gruppenListeAnzeigen(); }
    } catch (error) {
        if (uploaded && aktiverBenutzer.bildPfad !== uploaded) await supabaseClient.storage.from('profilbilder').remove([uploaded]);
        profilMeldung.textContent = error.message;
    } finally { buttons.forEach(b => { b.disabled = false; }); }
}
async function kontoLoeschenOeffnen() {
    const dialog = document.querySelector('#konto-loeschen-dialog');
    const nachfolge = document.querySelector('#admin-nachfolge');
    document.querySelector('#konto-loeschen-formular').reset();
    document.querySelector('#loesch-meldung').textContent = '';
    nachfolge.replaceChildren();
    dialog.showModal();
    try {
        const data = datenAusErgebnis(await supabaseClient.rpc('gruppen_auflisten'));
        for (const g of data.map(gruppeFuerBrowser).filter(g => g.rolle === 'admin' && !g.istPersoenlich && g.mitgliederAnzahl > 1)) {
            const details = await gruppenDetailsLaden(g);
            const row = elementErstellen('div', 'nachfolge-zeile');
            const label = elementErstellen('label', null, 'Neuer Admin für „' + g.name + '“');
            const select = document.createElement('select');
            const placeholder = elementErstellen('option', null, 'Person auswählen'); placeholder.value = ''; select.append(placeholder);
            for (const m of details.mitglieder.filter(m => m.id !== aktiverBenutzer.id)) {
                const o = elementErstellen('option', null, m.anzeigename); o.value = m.id; select.append(o);
            }
            label.append(select);
            const button = elementErstellen('button', 'sekundaer-button', 'Adminrolle übertragen'); button.type = 'button';
            button.addEventListener('click', async () => {
                if (!select.value) return;
                button.disabled = true;
                try {
                    datenAusErgebnis(await supabaseClient.rpc('admin_uebertragen', { p_gruppe: g.id, p_person: select.value }));
                    row.replaceChildren(elementErstellen('p', null, 'Adminrolle für „' + g.name + '“ übertragen. Du bist jetzt Mitglied.'));
                } catch (e) { document.querySelector('#loesch-meldung').textContent = e.message; button.disabled = false; }
            });
            row.append(label, button); nachfolge.append(row);
        }
    } catch (e) { document.querySelector('#loesch-meldung').textContent = e.message; }
}

// Alle Inhalte werden mit textContent erzeugt, niemals als HTML interpretiert.
function markierungElement(mark, neu, entfernt, onHide) {
    const span = elementErstellen('span', 'aenderung');
    if (entfernt) span.append(elementErstellen('del', null, entfernt));
    if (neu) span.append(elementErstellen('span', null, neu));
    const author = verknuepftesObjekt(mark.autor);
    const note = elementErstellen('small', 'aenderung-autor', 'Bearbeitet von ' + (author?.anzeigename || 'Gelöschtes Konto'));
    const close = elementErstellen('button', 'aenderung-ausblenden', '×'); close.type = 'button';
    close.setAttribute('aria-label', 'Diesen Änderungshinweis nur für mich ausblenden');
    close.title = 'Nur für mich ausblenden';
    close.addEventListener('click', async () => {
        close.disabled = true;
        try {
            datenAusErgebnis(await supabaseClient.from('ausgeblendete_aenderungen').upsert({ aenderung_id: mark.id, benutzer_id: aktiverBenutzer.id }, { ignoreDuplicates: true }));
            onHide(mark.id);
        } catch (e) { close.disabled = false; note.textContent = e.message; }
    });
    note.append(close); span.append(note); return span;
}
function textMitMarkierungen(text, marks, onHide) {
    const fragment = document.createDocumentFragment();
    const ranges = marks.flatMap(m => (m.bereiche || [{ start: m.start_pos, end: m.ende_pos }]).map((r, i) => ({ ...r, mark: m, removed: i === 0 ? m.alter_text : '' })))
        .sort((a,b) => a.start - b.start || a.end - b.end);
    let pos = 0;
    for (const r of ranges) {
        if (r.start < pos || r.end > text.length) continue;
        fragment.append(document.createTextNode(text.slice(pos, r.start)), markierungElement(r.mark, text.slice(r.start, r.end), r.removed, onHide));
        pos = r.end;
    }
    fragment.append(document.createTextNode(text.slice(pos)));
    return fragment;
}
async function alleZeilenLaden(query) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
        const batch = datenAusErgebnis(await query.range(offset, offset + 499));
        rows.push(...batch);
        if (batch.length < 500) return rows;
    }
}
async function aenderungenAnzeigen(rezept) {
    clearTimeout(aenderungsTimer);
    try {
        const [markResult, hiddenResult] = await Promise.all([
            alleZeilenLaden(supabaseClient.from('rezept_aenderungen').select('*, autor:profile!rezept_aenderungen_autor_id_fkey(anzeigename)').eq('rezept_id', rezept.id).order('id')),
            alleZeilenLaden(supabaseClient.from('ausgeblendete_aenderungen').select('aenderung_id').order('aenderung_id'))
        ]);
        let marks = markResult;
        const hidden = new Set(hiddenResult.map(h => h.aenderung_id));
        marks = marks.filter(m => !hidden.has(m.id));
        function render() {
            if (ausgewaehltesRezept !== rezept || !rezeptDetailDialog.open) return;
            marks = marks.filter(m => Date.parse(m.ablauf_am) > Date.now());
            const hide = id => { marks = marks.filter(m => m.id !== id); render(); };
            rezeptDetailInhalt.querySelector('.rezept-detail-titel').replaceChildren(textMitMarkierungen(rezept.name, marks.filter(m => m.feld === 'name'), hide));
            rezeptDetailInhalt.querySelector('.rezept-text').replaceChildren(textMitMarkierungen(rezept.text, marks.filter(m => m.feld === 'text'), hide));
            rezeptDetailInhalt.querySelector('.weitere-aenderungen')?.remove();
            const extra = elementErstellen('div', 'weitere-aenderungen');
            for (const mark of marks.filter(m => !['name','text'].includes(m.feld))) {
                const labels = { kalorien: 'Kalorien', protein: 'Protein', kohlenhydrate: 'Kohlenhydrate', fett: 'Fett' };
                const line = elementErstellen('p');
                if (mark.feld !== 'bild_pfad') line.append(document.createTextNode(labels[mark.feld] + ': '));
                line.append(markierungElement(mark, mark.feld === 'bild_pfad' ? 'Foto geändert' : String(rezept.naehrwerte[mark.feld] ?? '—'), mark.alter_text, hide));
                extra.append(line);
            }
            rezeptDetailInhalt.append(extra);
            clearTimeout(aenderungsTimer);
            if (marks.length) {
                const delay = Math.min(...marks.map(m => Date.parse(m.ablauf_am))) - Date.now();
                aenderungsTimer = setTimeout(render, Math.max(1, Math.min(delay + 10, 2147483647)));
            }
        }
        render();
    } catch (e) {
        if (ausgewaehltesRezept === rezept) rezeptDetailInhalt.append(elementErstellen('p', 'fehlermeldung', 'Änderungshinweise konnten nicht geladen werden: ' + e.message));
    }
}
function erweiterungenInitialisieren() {
    document.querySelector('#konto-einstellungen').addEventListener('click', () => profilOeffnen());
    document.querySelector('#profil-schliessen').addEventListener('click', () => profilDialog.close());
    profilDialog.addEventListener('cancel', event => { if (profilOnboarding || aktiverBenutzer?.wirdGeloescht) event.preventDefault(); });
    profilDialog.addEventListener('close', () => { if (profilObjektUrl) URL.revokeObjectURL(profilObjektUrl); profilObjektUrl = null; });
    document.querySelector('#profil-datei').addEventListener('change', async event => {
        profilMeldung.textContent = '';
        const file = event.target.files[0]; if (!file) return;
        try {
            bildDateiPruefen(file);
            const decoded = await createImageBitmap(file); decoded.close();
            if (profilObjektUrl) URL.revokeObjectURL(profilObjektUrl);
            profilObjektUrl = URL.createObjectURL(file);
            document.querySelector('#profil-vorschau').src = profilObjektUrl;
                } catch (e) { event.target.value = ''; profilMeldung.textContent = 'Das Bild konnte nicht gelesen werden. ' + e.message; document.querySelector('#profil-vorschau').src = await profilBildUrl(aktiverBenutzer.bildPfad); }
    });
    document.querySelector('#profil-foto-aendern').addEventListener('click', () => document.querySelector('#profil-datei').click());
    document.querySelector('#profil-abbrechen').addEventListener('click', () => profilDialog.close());
    document.querySelector('#profil-spaeter').addEventListener('click', () => profilSpeichern(true));
    profilFormular.addEventListener('submit', e => { e.preventDefault(); profilSpeichern(); });
    document.querySelector('#kopf-profilbild').addEventListener('error', event => { event.target.src = STANDARD_PROFILBILD; }, { once: true });
    document.querySelector('#konto-loeschen-oeffnen').addEventListener('click', kontoLoeschenOeffnen);
    document.querySelector('#konto-loeschen-abbrechen').addEventListener('click', () => document.querySelector('#konto-loeschen-dialog').close());
    document.querySelector('#konto-loeschen-formular').addEventListener('submit', async event => {
        event.preventDefault();
        const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
        const message = document.querySelector('#loesch-meldung'); message.textContent = '';
        try {
            await serverFunktion('konto-loeschen', { passwort: document.querySelector('#loesch-passwort').value, bestaetigt: document.querySelector('#loesch-bestaetigung').checked });
            await supabaseClient.auth.signOut({ scope: 'local' });
            localStorage.removeItem('aktiveGruppenId');
            window.location.replace(window.location.pathname);
        } catch (e) { message.textContent = e.message; }
        finally { document.querySelector('#loesch-passwort').value = ''; button.disabled = false; }
    });
    rezeptDetailDialog.addEventListener('close', () => clearTimeout(aenderungsTimer));
}
