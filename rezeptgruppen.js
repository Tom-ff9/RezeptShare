// Getrennte Zustände für Übersicht, Formular und Zuordnung einer Rezeptfamilie.
let filterGruppenIds = null;
let filterKonto = null;
let formularGruppenIds = [];
let formularAuftrag = null;
let bearbeiteteGruppenKopien = [];
let bearbeitungsZwischenstand = null;
let kontextWahl = null;
let detailWahl = null;
let detailLadeNummer = 0;
let zuordnungNachAnmeldung = false;
const rezeptLinkToken = new URLSearchParams(window.location.search).get('rezept');
let wahlNummer = 0;

function mehrfachwahl({ titel, optionen, ausgewaehlt, alle = false, uebernehmen, id }) {
    const host = elementErstellen('div', 'mehrfachwahl');
    const button = elementErstellen('button', 'sekundaer-button gruppen-wahl-button');
    button.type = 'button';
    if (id) button.id = id;
    const panel = elementErstellen('div', 'gruppen-wahl-panel');
    panel.id = 'gruppen-panel-' + (++wahlNummer);
    panel.hidden = true;
    panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', titel);
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', panel.id);
    const list = elementErstellen('div', 'gruppen-wahl-liste');
    const error = elementErstellen('p', 'fehlermeldung'); error.setAttribute('role', 'status');
    const actions = elementErstellen('div', 'gruppen-wahl-aktionen');
    const apply = elementErstellen('button', 'primaer-button', 'Übernehmen'); apply.type = 'button';
    const cancel = elementErstellen('button', 'sekundaer-button', 'Abbrechen'); cancel.type = 'button';
    let saved = new Set(ausgewaehlt), draft = new Set(saved), busy = false;
    const checks = [];
    let allInput;
    function label(text, value, disabled = false) {
        const row = elementErstellen('label', 'gruppen-wahl-option');
        const input = document.createElement('input'); input.type = 'checkbox'; input.disabled = disabled;
        input.dataset.gruppe = value;
        row.append(input, elementErstellen('span', null, text)); list.append(row);
        return input;
    }
    if (alle) {
        allInput = label('Alle Gruppen', 'alle');
        allInput.addEventListener('change', () => {
            draft = allInput.checked ? new Set(optionen.map(g => g.id)) : new Set(); sync();
        });
    }
    for (const item of optionen) {
        const input = label(item.name + (item.hinweis ? ' (' + item.hinweis + ')' : ''), item.id, item.disabled);
        checks.push([item, input]);
        input.addEventListener('change', () => { if (input.checked) draft.add(item.id); else draft.delete(item.id); sync(); });
    }
    function sync() {
        checks.forEach(([g, input]) => { input.checked = draft.has(g.id); });
        if (allInput) { allInput.checked = optionen.length > 0 && draft.size === optionen.length; allInput.indeterminate = draft.size > 0 && draft.size < optionen.length; }
        button.textContent = titel + ' (' + saved.size + ')';
        button.setAttribute('aria-label', titel + ', ' + saved.size + ' ausgewählt');
    }
    function close(focus = false) {
        if (busy) return;
        panel.hidden = true; button.setAttribute('aria-expanded', 'false');
        if (focus) button.focus();
    }
    host.schliessen = close;
    button.addEventListener('click', () => {
        if (!panel.hidden) return close();
        draft = new Set(saved); sync(); error.textContent = '';
        panel.hidden = false; button.setAttribute('aria-expanded', 'true');
        (checks.find(([, input]) => !input.disabled)?.[1] || allInput || cancel).focus();
    });
    host.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    cancel.addEventListener('click', () => close(true));
    apply.addEventListener('click', async () => {
        if (busy) return;
        busy = true; error.textContent = ''; host.setAttribute('aria-busy', 'true');
        const states = [...panel.querySelectorAll('button,input')].map(el => [el, el.disabled]);
        states.forEach(([el]) => { el.disabled = true; });
        try {
            const accepted = await uebernehmen([...draft]);
            if (accepted !== false) { saved = new Set(draft); sync(); busy = false; close(true); }
        } catch (e) { error.textContent = e.message; }
        finally { busy = false; host.removeAttribute('aria-busy'); states.forEach(([el, disabled]) => { el.disabled = disabled; }); }
    });
    actions.append(cancel, apply); panel.append(list, error, actions); host.append(button, panel); sync();
    return { host, button, close };
}
document.addEventListener('click', event => {
    if (event.target.closest?.('#bestaetigungs-dialog')) return;
    document.querySelectorAll('.mehrfachwahl').forEach(host => { if (!host.contains(event.target)) host.schliessen(); });
});
function filterInitialisieren() {
    if (filterKonto !== aktiverBenutzer.id) {
        filterKonto = aktiverBenutzer.id;
        let stored;
        try { stored = JSON.parse(localStorage.getItem('gruppenFilter:' + filterKonto)); } catch { /* Ohne Speicher nutzbar. */ }
        filterGruppenIds = Array.isArray(stored) ? stored : stored === 'alle' ? null : [aktiveGruppenId].filter(Boolean);
    }
    if (filterGruppenIds) filterGruppenIds = filterGruppenIds.filter(id => gruppen.some(g => g.id === id));
    alleGruppenAnzeigen = filterGruppenIds === null;
}
function kontextAuswahlAktualisieren() {
    const formular = aktiveAnsicht === 'hinzufuegen';
    const ids = formular ? formularGruppenIds : filterGruppenIds ?? gruppen.map(g => g.id);
    kontextWahl = mehrfachwahl({
        titel: formular ? 'Gruppen zuordnen' : 'Gruppen filtern', id: 'gruppen-auswahl',
        optionen: gruppen.map(g => ({...g, disabled: formular && (bearbeiteteGruppenKopien.some(r => Number(r.gruppen_id) === g.id) ? !darfRezepteBearbeiten(g.id) || (g.rolle !== 'admin' && bearbeiteteGruppenKopien.find(r => Number(r.gruppen_id) === g.id).erstellt_von !== aktiverBenutzer.id) : !darfRezepteBearbeiten(g.id)), hinweis: formular && !darfRezepteBearbeiten(g.id) ? 'nur ansehen' : ''})),
        ausgewaehlt: ids, alle: !formular,
        uebernehmen: async selected => {
            if (formular) {
                if (!selected.length && !bearbeitetesRezeptId) throw new Error('Bitte wähle mindestens eine Gruppe.');
                formularGruppenIds = selected; formularGeaendert = true; formularAuftrag = null;
            } else {
                filterGruppenIds = selected.length === gruppen.length ? null : selected;
                alleGruppenAnzeigen = filterGruppenIds === null;
                try { localStorage.setItem('gruppenFilter:' + aktiverBenutzer.id, JSON.stringify(filterGruppenIds ?? 'alle')); } catch { /* Sitzung bleibt nutzbar. */ }
                rechteAnzeigen(); await rezepteLaden();
            }
        }
    });
    gruppenKontext.replaceChildren(kontextWahl.host);
}
function standardFormularGruppen() {
    const ids = filterGruppenIds ?? [aktiveGruppenId];
    const writable = ids.filter(id => darfRezepteBearbeiten(id));
    return writable.length ? writable : gruppen.filter(g => darfRezepteBearbeiten(g.id)).slice(0, 1).map(g => g.id);
}
function detailMeldung(text) {
    const output = document.querySelector('#rezept-aktions-meldung'); output.textContent = text; output.hidden = false;
}
async function rezeptZuordnungVorbereiten(rezept) {
    const generation = ++detailLadeNummer;
    const slot = document.querySelector('#rezept-gruppen-platz'); slot.replaceChildren();
    if (rezept.istFreigabe && !aktiverBenutzer) {
        const login = elementErstellen('button', 'sekundaer-button', 'Gruppen zuordnen'); login.type = 'button';
        login.addEventListener('click', () => {
            zuordnungNachAnmeldung = true; rezeptDetailDialog.close(); authFormularOeffnen('anmelden');
        });
        slot.append(login); return;
    }
    try {
        const rows = rezept.istFreigabe
            ? (await serverFunktion('rezept-gruppen', { aktion: 'zuordnungen', token: rezept.token })).kopien
            : await alleZeilenLaden(supabaseClient.from('rezepte').select('id,gruppen_id,version,erstellt_von').eq('familie_id', rezept.familieId).order('id'));
        if (generation !== detailLadeNummer || ausgewaehltesRezept !== rezept) return;
        rezept.gruppenKopien = rows;
        const byGroup = new Map(rows.map(r => [Number(r.gruppen_id), r]));
        let pending = null;
        detailWahl = mehrfachwahl({
            titel: 'Gruppen zuordnen', ausgewaehlt: [...byGroup.keys()],
            optionen: gruppen.map(g => {
                const copy = byGroup.get(g.id);
                const canDelete = !rezept.istFreigabe && copy && darfRezepteBearbeiten(g.id) && (g.rolle === 'admin' || copy.erstellt_von === aktiverBenutzer.id);
                return {...g, disabled: copy ? !canDelete : !darfRezepteBearbeiten(g.id), hinweis: copy && !canDelete ? 'bereits zugeordnet' : !darfRezepteBearbeiten(g.id) ? 'nur ansehen' : ''};
            }),
            uebernehmen: async selected => {
                const removed = rows.filter(r => !selected.includes(Number(r.gruppen_id)));
                const signature = JSON.stringify(selected.slice().sort());
                if (!pending || pending.signature !== signature) pending = {signature, id: crypto.randomUUID()};
                if (removed.length) {
                    const names = removed.map(r => gruppen.find(g => g.id === Number(r.gruppen_id))?.name).join(', ');
                    const last = rows.length === removed.length && !selected.length;
                    if (!await bestaetigungFragen(last ? 'Letzte Kopie löschen?' : 'Gruppenkopien löschen?',
                        'Die unabhängigen Kopien in diesen Gruppen werden gelöscht: ' + names + '.' + (last ? ' Damit entfernst du die letzte für dich sichtbare Kopie.' : ' Andere Kopien bleiben erhalten.'), 'Kopien löschen', true)) return false;
                }
                const result = await serverFunktion('rezept-gruppen', {
                    aktion: rezept.istFreigabe ? 'uebernehmen' : 'zuordnen', auftrag: pending.id,
                    ...(rezept.istFreigabe ? {token: rezept.token} : {id: rezept.id, version: rezept.version}),
                    gruppen: selected, entfernen: removed
                });
                // Die Mutation ist erfolgreich. Ein fehlgeschlagenes Neuladen darf
                // keinen erneuten Kopiervorgang mit neuer Auftrags-ID auslösen.
                detailMeldung('Rezept den ausgewählten Gruppen zugeordnet.');
                try {
                    await gruppenLaden();
                    if (rezept.istFreigabe) await rezeptZuordnungVorbereiten(rezept);
                    else {
                        const replacement = result.kopien.find(r => Number(r.id) === rezept.id) || result.kopien[0];
                        if (replacement) {
                            const raw = datenAusErgebnis(await supabaseClient.from('rezepte').select('*,ersteller:profile!rezepte_erstellt_von_fkey(id,anzeigename)').eq('id', replacement.id).single());
                            await rezeptDetailsAnzeigen(await rezeptFuerBrowser(raw));
                            detailMeldung('Rezept den ausgewählten Gruppen zugeordnet.');
                        } else { rezeptDetailDialog.close(); document.querySelector('#gruppen-status').textContent = 'Rezeptkopien entfernt.'; }
                    }
                } catch { detailMeldung('Rezept den ausgewählten Gruppen zugeordnet. Bitte lade die Ansicht neu.'); }
            }
        });
        slot.replaceChildren(detailWahl.host);
        if (zuordnungNachAnmeldung) { zuordnungNachAnmeldung = false; detailWahl.button.click(); }
    } catch (e) { slot.append(elementErstellen('p', 'fehlermeldung', 'Gruppenzuordnung konnte nicht geladen werden: ' + e.message)); }
}
async function geteiltesRezeptOeffnen() {
    if (!rezeptLinkToken) return;
    try {
        const d = await serverFunktion('rezept-gruppen', {aktion: 'ansehen', token: rezeptLinkToken});
        await rezeptDetailsAnzeigen({ id: null, istFreigabe: true, token: rezeptLinkToken,
            name: d.name, text: d.text, bild: d.bild, geteiltVon: d.geteilt_von,
            ersteller: {anzeigename: d.geteilt_von}, naehrwerte: {kalorien:d.kalorien,protein:d.protein,kohlenhydrate:d.kohlenhydrate,fett:d.fett} });
    } catch {
        const title = elementErstellen('h2', null, 'Rezeptlink nicht verfügbar'); title.id = 'rezept-detail-titel';
        rezeptDetailDialog.setAttribute('aria-labelledby', title.id);
        rezeptDetailInhalt.replaceChildren(title, elementErstellen('p', null, 'Dieser Rezeptlink ist ungültig oder nicht mehr verfügbar.'));
        rezeptDetailDialog.querySelector('.dialog-aktionen').hidden = true;
        document.querySelector('#rezept-aktions-meldung').hidden = true;
        document.querySelector('#rezept-link-ausgabe').replaceChildren();
        if (!rezeptDetailDialog.open) rezeptDetailDialog.showModal();
    }
}
async function rezeptTeilen() {
    const rezept = ausgewaehltesRezept;
    if (!rezept) return;
    const button = document.querySelector('#rezept-teilen-button'); button.disabled = true;
    const output = document.querySelector('#rezept-link-ausgabe'); output.replaceChildren();
    try {
        const token = rezept.istFreigabe ? rezept.token : (await serverFunktion('rezept-gruppen', {aktion:'teilen',id:rezept.id,version:rezept.version})).token;
        const url = new URL(window.location.href); url.search = ''; url.hash = ''; url.searchParams.set('rezept',token);
        if (navigator.share) {
            try { await navigator.share({title:rezept.name,url:url.href}); return; }
            catch (e) { if (e.name === 'AbortError') return; }
        }
        try { await navigator.clipboard.writeText(url.href); detailMeldung('Rezeptlink kopiert.'); }
        catch {
            const input = document.createElement('input'); input.readOnly = true; input.value = url.href; input.setAttribute('aria-label','Rezeptlink zum Kopieren');
            output.append(input); input.focus(); input.select(); detailMeldung('Kopiere diesen Link, um das Rezept zu teilen.');
        }
    } catch (e) { detailMeldung(e.message); }
    finally { button.disabled = false; }
}
