import { importPruefen, formularDaten, zusammenfuehren, importFehlerMeldung, initialesGerichtsfoto } from './import-format.mjs';

const $ = id => document.getElementById(id);
const dialog = $('kochbuch-import-dialog'), status = $('import-status');
let seiten = [], rezepte = [], hinweise = [], busy = false, generation = 0;
const el = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };
function button(text, action) {
    const b = el('button', text); b.type = 'button'; b.className = 'sekundaer-button';
    b.addEventListener('click', async () => {
        b.disabled = true;
        try { await action(); } catch (e) { status.textContent = e.message; }
        finally { b.disabled = false; }
    }); return b;
}
function field(parent, text, value, change, { type = 'textarea', max = 8000 } = {}) {
    const label = el('label', text), input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    else input.rows = 4;
    input.value = value ?? ''; input.maxLength = max;
    if (type === 'number') { input.min = '0'; input.step = 'any'; }
    input.addEventListener('input', () => change(input.value));
    label.append(input); parent.append(label); return input;
}
const blobData = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.')); reader.readAsDataURL(blob);
});
async function canvasBlob(canvas, quality) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Bildkomprimierung fehlgeschlagen.');
    return blob;
}
export async function komprimieren(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) throw new Error('Bitte JPEG, PNG oder WebP mit höchstens 20 MB auswählen.');
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error('Das Bildformat konnte nicht gelesen werden. Bitte als JPEG exportieren.'); }
    try {
        if (bitmap.width * bitmap.height > 60000000) throw new Error('Das Originalbild ist zu groß (maximal 60 Megapixel).');
        const canvas = el('canvas');
        const scale = Math.min(1, 2304 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let blob;
        for (const quality of [0.86, 0.73, 0.58, 0.42]) {
            blob = await canvasBlob(canvas, quality);
            if (blob.size <= 1024 * 1024) break;
        }
        if (blob.size > 1024 * 1024) throw new Error('Bild bleibt zu groß. Bitte einen kleineren Ausschnitt auswählen.');
        return { blob, url: URL.createObjectURL(blob), data: await blobData(blob) };
    } finally { bitmap.close(); }
}
function sperren(value) {
    busy = value;
    for (const id of ['import-dateien','import-kamera','import-erkennen','import-einwilligung']) $(id).disabled = value;
    $('import-seiten').querySelectorAll('button').forEach(b => { b.disabled = value; });
}
function seitenAnzeigen() {
    $('import-seiten').replaceChildren();
    seiten.forEach((s, i) => {
        const li = el('li'), image = el('img'); image.src = s.url; image.alt = 'Quellseite ' + (i + 1);
        li.append(image, el('span', 'Seite ' + (i + 1) + ' · ' + Math.round(s.blob.size / 1024) + ' KB'), button('Entfernen', () => {
            URL.revokeObjectURL(s.url); seiten.splice(i, 1); rezepte = []; ergebnisseAnzeigen(); seitenAnzeigen();
        })); $('import-seiten').append(li);
    });
}
async function dateienHinzufuegen(event) {
    const files = [...event.target.files]; event.target.value = '';
    if (busy || !files.length) return;
    if (seiten.length + files.length > 6) { status.textContent = 'Maximal 6 Seiten. Bitte zuerst Seiten entfernen.'; return; }
    const ticket = generation; sperren(true); status.textContent = 'Bilder werden lokal komprimiert …';
    try {
        for (const file of files) {
            const s = await komprimieren(file);
            if (generation !== ticket) { URL.revokeObjectURL(s.url); return; }
            if (seiten.reduce((n, p) => n + p.blob.size, 0) + s.blob.size > 5 * 1024 * 1024) {
                URL.revokeObjectURL(s.url); throw new Error('Insgesamt maximal 5 MB. Bitte weniger Seiten wählen.');
            }
            seiten.push(s);
        }
        rezepte = []; status.textContent = 'Seitenreihenfolge prüfen, dann Erkennung starten.';
    } catch (e) { status.textContent = e.message; }
    finally { if (generation === ticket) { sperren(false); seitenAnzeigen(); ergebnisseAnzeigen(); } }
}
function loeschen() {
    generation++; seiten.forEach(s => URL.revokeObjectURL(s.url)); seiten = []; rezepte = []; hinweise = [];
    $('import-einwilligung').checked = false; importBildDatei = null;
    sperren(false); seitenAnzeigen(); ergebnisseAnzeigen(); status.textContent = ''; dialog.close();
}
window.rezeptImport = { loeschen };
$('import-dateien').addEventListener('change', dateienHinzufuegen);
$('import-kamera').addEventListener('change', dateienHinzufuegen);
$('import-schliessen').addEventListener('click', () => dialog.close());
$('import-verwerfen').addEventListener('click', loeschen);
$('kochbuch-import-oeffnen').addEventListener('click', () => {
    if (!aktiverBenutzer || !darfRezeptHinzufuegen()) return;
    dialog.showModal();
});
$('import-erkennen').addEventListener('click', async () => {
    if (busy) return;
    if (!$('import-einwilligung').checked || !seiten.length) { status.textContent = 'Bitte Bilder auswählen und die Verarbeitung bestätigen.'; return; }
    if (rezepte.length && !await bestaetigungFragen('Erkennung wiederholen?', 'Die bisherigen Importkorrekturen werden ersetzt.', 'Erneut erkennen')) return;
    const ticket = generation, person = aktiverBenutzer?.id;
    sperren(true); status.textContent = 'Rezepte werden erkannt. Das kann bis zu 90 Sekunden dauern …';
    try {
        const result = await serverFunktion('rezept-importieren', { einwilligung: true, bilder: seiten.map(s => s.data) });
        if (ticket !== generation || person !== aktiverBenutzer?.id) return;
        importPruefen(result, seiten.length);
        rezepte = result.rezepte.map(r => ({ ...r, fassung: 'ueberarbeitet', bild: initialesGerichtsfoto(r), geprueft: false })); hinweise = result.hinweise;
        status.textContent = rezepte.length ? rezepte.length + ' Rezepte erkannt. Jede Fassung, Zuordnung und Menge prüfen.' : 'Keine Rezepte erkannt. Bitte schärfere Fotos versuchen.';
        ergebnisseAnzeigen();
    } catch (e) { if (ticket === generation) status.textContent = importFehlerMeldung(e); }
    finally { if (ticket === generation) sperren(false); }
});

function versionEditor(parent, r, key) {
    const details = el('details'), summary = el('summary', key === 'original' ? 'Originalfassung bearbeiten' : 'Überarbeitete Fassung bearbeiten'); details.append(summary);
    const v = r[key];
    for (const [name, title, max] of [['name','Name',120],['zutaten','Zutaten',8000],['zubereitung','Zubereitung',8000]]) field(details, title, v[name], value => { v[name] = value; }, { max });
    const n = v.naehrwerte;
    details.append(el('p', 'Nur abgelesene Werte pro Portion. Fehlende Angaben leer lassen.'));
    for (const name of ['kalorien','protein','kohlenhydrate','fett']) field(details, name, n[name], value => { n[name] = value === '' ? null : Number(value); }, { type: 'number' });
    field(details, 'Nährwertquelle und Bezugsgröße', n.quelle, value => { n.quelle = value; }, { max: 500 });
    parent.append(details);
}
function bildEditor(parent, r) {
    const details = el('details'); details.append(el('summary', 'Rezeptbild auswählen und Ausschnitt korrigieren'));
    const select = el('select'); select.setAttribute('aria-label', 'Bildquelle');
    const options = [['kein','Kein Bild'],['eigen','Eigenes Foto im Rezeptformular auswählen']];
    seiten.forEach((_, i) => options.push(['seite:' + i, 'Originalseitenbild ' + (i + 1) + ' dauerhaft als Rezeptbild speichern']));
    r.fotos.forEach((f, i) => options.push(['foto:' + i, 'Gerichtsfoto auf Seite ' + f.seite + (f.unsicher ? ' (Zuordnung unsicher)' : '')]));
    for (const [value, text] of options) { const option = el('option', text); option.value = value; select.append(option); }
    select.value = r.bild;
    const cropPreview = el('div'); cropPreview.className = 'import-gerichtsfoto-vorschau'; cropPreview.setAttribute('aria-live', 'polite');
    const preview = el('div'); details.append(select, preview); parent.append(cropPreview, details);
    async function cropZeichnen(canvas, photo) {
        try {
            const bitmap = await createImageBitmap(await ausschneiden(photo));
            canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
        } catch (e) { status.textContent = e.message; }
    }
    function render() {
        preview.replaceChildren(); cropPreview.replaceChildren(); r.bild = select.value;
        if (!r.bild.startsWith('foto:') && !r.bild.startsWith('seite:')) return;
        const photo = r.bild.startsWith('foto:') ? r.fotos[Number(r.bild.split(':')[1])] : null;
        const page = photo ? photo.seite - 1 : Number(r.bild.split(':')[1]);
        if (photo) {
            cropPreview.append(el('p', 'Vorausgewählter Gerichtsausschnitt – vor dem Speichern prüfen.'));
            const selectedCrop = el('canvas'); selectedCrop.className = 'import-ausschnitt import-ausschnitt-vorschau';
            selectedCrop.setAttribute('role', 'img'); selectedCrop.setAttribute('aria-label', 'Zugeschnittener Vorschlag für das Gerichtsfoto');
            cropPreview.append(selectedCrop); cropZeichnen(selectedCrop, photo);
        }
        const image = el('img'); image.src = seiten[page].url; image.alt = 'Vollständige Quellseite zur Ausschnittprüfung'; image.className = 'import-quellbild';
        preview.append(image);
        if (!photo) return;
        preview.append(el('p', 'Koordinaten in Prozent der Quellseite (links/oben ab 0). Ausschnitt vor Übernahme prüfen.'));
        const crop = el('canvas'); crop.className = 'import-ausschnitt'; crop.setAttribute('aria-label', 'Vorschau des tatsächlichen Bildausschnitts');
        const draw = () => cropZeichnen(crop, photo);
        for (const [key, label] of [['seite','Quellseite'],['x','Links (%)'],['y','Oben (%)'],['breite','Breite (%)'],['hoehe','Höhe (%)']]) {
            const input = field(preview, label, key === 'seite' ? photo[key] : photo[key] * 100, value => { photo[key] = key === 'seite' ? Number(value) : Number(value) / 100; draw(); }, { type: 'number' });
            input.max = key === 'seite' ? String(seiten.length) : '100'; input.min = key === 'seite' ? '1' : '0';
        }
        preview.append(crop); draw();
    }
    select.addEventListener('change', render); render();
}
async function ausschneiden(f) {
    if (!Number.isInteger(f.seite) || !seiten[f.seite - 1] || ![f.x,f.y,f.breite,f.hoehe].every(Number.isFinite)
        || f.x < 0 || f.y < 0 || f.breite <= 0 || f.hoehe <= 0 || f.x + f.breite > 1.001 || f.y + f.hoehe > 1.001) throw new Error('Bitte gültigen Bildausschnitt innerhalb einer Quellseite wählen.');
    const bitmap = await createImageBitmap(seiten[f.seite - 1].blob);
    try {
        const canvas = el('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * f.breite)); canvas.height = Math.max(1, Math.round(bitmap.height * f.hoehe));
        canvas.getContext('2d').drawImage(bitmap, f.x * bitmap.width, f.y * bitmap.height, bitmap.width * f.breite, bitmap.height * f.hoehe, 0, 0, canvas.width, canvas.height);
        return await canvasBlob(canvas, 0.9);
    } finally { bitmap.close(); }
}
async function uebernehmen(r) {
    if (busy || !aktiverBenutzer || !darfRezeptHinzufuegen()) throw new Error('Bitte anmelden und eine beschreibbare Gruppe wählen.');
    if (!r.geprueft) throw new Error('Bitte zuerst Mengen, Änderungen und Seitenzuordnung als geprüft bestätigen.');
    if (!r.quellen.length || r.quellen.some(q => !Number.isInteger(q.seite) || q.seite < 1 || q.seite > seiten.length)) throw new Error('Bitte gültige Quellseiten zuordnen.');
    const ticket = generation, person = aktiverBenutzer.id;
    const data = formularDaten(r, r.fassung);
    for (const key of ['kalorien','protein','kohlenhydrate','fett']) if (data[key] !== null && (!Number.isFinite(data[key]) || data[key] < 0)) throw new Error('Ungültige Nährwerte.');
    if (formularGeaendert && !await bestaetigungFragen('Formular ersetzen?', 'Ungespeicherte Formulareingaben werden ersetzt. Der Import bleibt verfügbar.', 'Ersetzen')) return;
    let image = null;
    if (r.bild.startsWith('foto:')) image = await ausschneiden(r.fotos[Number(r.bild.split(':')[1])]);
    if (r.bild.startsWith('seite:')) image = seiten[Number(r.bild.split(':')[1])].blob;
    if (ticket !== generation || person !== aktiverBenutzer?.id) return;
    // Alle Speicher-, Rechte-, Gruppen- und Uploadschritte bleiben im vorhandenen Formular.
    formularZuruecksetzen();
    rezeptNameEingabe.value = data.name; rezeptTextEingabe.value = data.text;
    for (const key of ['kalorien','protein','kohlenhydrate','fett']) $(key).value = data[key] ?? '';
    importBildDatei = image ? new File([image], 'kochbuch-ausschnitt.jpg', { type: 'image/jpeg' }) : null;
    formularGeaendert = true; ansichtAnzeigen('hinzufuegen'); dialog.close();
    bildHinweis.textContent = image ? 'Ausgewähltes Importbild wird beim Speichern hochgeladen. Ein eigenes Foto ersetzt es.' : 'Kein Importbild gewählt. Du kannst ein eigenes Foto auswählen.';
    rezeptMeldung.textContent = 'Import übernommen. Text und Gruppen prüfen und mit „Rezept hinzufügen“ speichern. Weitere Importrezepte bleiben über den Importbutton verfügbar.';
    (r.bild === 'eigen' ? rezeptBildEingabe : rezeptNameEingabe).focus();
}
function ergebnisseAnzeigen() {
    const host = $('import-ergebnisse'); host.replaceChildren();
    $('import-exportieren').hidden = !rezepte.length;
    for (const note of hinweise) host.append(el('p', note));
    rezepte.forEach((r, index) => {
        const card = el('article'); card.className = 'import-rezept';
        card.append(el('h3', (index + 1) + '. ' + (r.ueberarbeitet.name || 'Unbenanntes Rezept')));
        card.append(el('p', 'Quellen: ' + r.quellen.map(q => 'Seite ' + q.seite + ': ' + q.stelle).join('; ')));
        if (r.zuordnungUnsicher || r.unsicherheiten.length) card.append(el('p', '⚠ Unsicher: ' + r.unsicherheiten.join('; ') + (r.zuordnungUnsicher ? ' Seitenzuordnung prüfen.' : '')));
        const choice = el('label', 'Fassung zur Übernahme'), select = el('select');
        for (const [value, title] of [['original','Original'],['ueberarbeitet','Überarbeitet']]) { const o = el('option', title); o.value = value; select.append(o); }
        select.value = r.fassung; select.addEventListener('change', () => { r.fassung = select.value; }); choice.append(select); card.append(choice);
        versionEditor(card, r, 'original'); versionEditor(card, r, 'ueberarbeitet');
        field(card, 'Notizen prüfen und bearbeiten', r.notizen, value => { r.notizen = value; }, { max: 4000 });
        field(card, 'Unsichere Stellen (eine pro Zeile)', r.unsicherheiten.join('\n'), value => { r.unsicherheiten = value.split('\n').filter(Boolean); });
        const changes = el('details'); changes.append(el('summary', 'Einzelne Änderungen (' + r.aenderungen.length + ')'));
        r.aenderungen.forEach(a => {
            const group = el('fieldset'); group.append(el('legend', a.feld + (a.unsicher ? ' – unsicher' : '')));
            for (const [key, title] of [['vorher','Vorher'],['nachher','Nachher'],['hinweis','Hinweis']]) field(group, title, a[key], value => { a[key] = value; }, { max: 2000 });
            changes.append(group);
        }); card.append(changes); bildEditor(card, r);
        const correction = el('details'); correction.append(el('summary', 'Rezeptzuordnung korrigieren / aufteilen'));
        correction.append(el('p', 'Zum Aufteilen eine Kopie erstellen und in beiden Fassungen nur die jeweils zugehörigen Zutaten/Schritte behalten. Zum Zusammenführen das Fortsetzungsrezept wählen; Reihenfolge anschließend prüfen.'));
        r.quellen.forEach(q => {
            const source = el('fieldset'); source.append(el('legend', 'Quellzuordnung'));
            const pageInput = field(source, 'Seitennummer', q.seite, value => { q.seite = Number(value); }, { type: 'number' });
            pageInput.min = '1'; pageInput.max = String(seiten.length); pageInput.step = '1';
            field(source, 'Textstelle auf der Seite', q.stelle, value => { q.stelle = value; }, { max: 1000 });
            source.append(button('Diese Quellzuordnung entfernen', () => {
                if (r.quellen.length === 1) throw new Error('Mindestens eine Quellzuordnung muss erhalten bleiben.');
                r.quellen.splice(r.quellen.indexOf(q), 1); r.geprueft = false; ergebnisseAnzeigen();
            })); correction.append(source);
        });
        const target = el('select'); target.setAttribute('aria-label', 'Fortsetzungsrezept');
        rezepte.forEach((other, i) => { if (i !== index) { const o = el('option', (i + 1) + '. ' + other.original.name); o.value = String(i); target.append(o); } });
        correction.append(target, button('Mit Fortsetzung zusammenführen', () => {
            if (rezepte.length < 2) return;
            const i = Number(target.value); rezepte[index] = { ...zusammenfuehren(r, rezepte[i]), geprueft: false, bild: 'kein' }; rezepte.splice(i, 1); ergebnisseAnzeigen();
        }), button('Kopie zum Aufteilen erstellen', () => {
            const copy = structuredClone(r); copy.geprueft = false; copy.zuordnungUnsicher = true; r.geprueft = false;
            rezepte.splice(index + 1, 0, copy); ergebnisseAnzeigen();
        }), button('Dieses Importrezept entfernen', () => { rezepte.splice(index, 1); ergebnisseAnzeigen(); })); card.append(correction);
        const checked = el('label', 'Ich habe Mengen, Fassungen, Nährwertbezug, Bild und Seitenzuordnung geprüft.'); checked.className = 'checkbox-zeile';
        const check = el('input'); check.type = 'checkbox'; check.checked = r.geprueft; check.addEventListener('change', () => { r.geprueft = check.checked; }); checked.prepend(check);
        const ungeprueft = event => { if (event.target !== check) { r.geprueft = false; check.checked = false; } };
        card.addEventListener('input', ungeprueft); card.addEventListener('change', ungeprueft);
        card.append(checked, button('Dieses Rezept ins Formular übernehmen', () => uebernehmen(r))); host.append(card);
    });
}
$('import-exportieren').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ hinweise, rezepte }, null, 2)], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = 'kochbuch-import.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
