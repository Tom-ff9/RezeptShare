import assert from 'node:assert/strict';

// Nur Darstellung normalisieren. Keine Synonyme, Einheitenumrechnung oder Mengenrundung.
export function normalisiereText(value) {
    return String(value).normalize('NFKC')
        .replace(/[\u00ad\u200b\ufeff]/g, '')
        .replace(/[„“”«»]/g, '"').replace(/[‘’‚]/g, "'")
        .replace(/[–—−]/g, '-').replace(/⁄/g, '/')
        .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
}
function ohneListenzeichen(text) {
    return text.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/gm, '');
}
export function schritteAusText(text) {
    const lines = text.replace(/\r\n?|[\u2028\u2029]/g, '\n').trim();
    // Nummerierte Schritte dürfen umbrochene Folgezeilen enthalten.
    if (/^\s*\d+[.)]\s/m.test(lines)) return lines.split(/(?:^|\n)\s*\d+[.)]\s+/).filter(s => s.trim()).map(normalisiereText);
    return lines.split(/\n+/).filter(s => s.trim()).map(normalisiereText);
}
export function mengenAusText(text) {
    return normalisiereText(text).match(/\d+(?:[.,]\d+)?(?:\/\d+)?/g)?.map(v => v.replace(',', '.')) || [];
}
export function pruefeFassung(actual, expected) {
    assert.equal(normalisiereText(actual.name), normalisiereText(expected.name), 'Titel');
    const zutaten = normalisiereText(ohneListenzeichen(actual.zutaten));
    const soll = normalisiereText(expected.zutaten.join('\n'));
    assert.equal(zutaten, soll, 'Zutaten, Mengen und Reihenfolge');
    assert.deepEqual(mengenAusText(ohneListenzeichen(actual.zutaten)), mengenAusText(expected.zutaten.join('\n')), 'Mengen unverändert');
    assert.deepEqual(schritteAusText(actual.zubereitung), expected.schritte.map(normalisiereText), 'Zubereitung und Schrittanzahl');
    const werte = Object.fromEntries(['kalorien','protein','kohlenhydrate','fett'].map(k => [k, actual.naehrwerte[k]]));
    assert.deepEqual(werte, expected.naehrwerte || {kalorien:null,protein:null,kohlenhydrate:null,fett:null}, 'Keine erfundenen Nährwerte');
}
export function pruefeErgebnis(actual, expected) {
    assert.equal(actual.rezepte.length, expected.length, 'Erkannte Rezeptanzahl');
    actual.rezepte.forEach((r, i) => {
        const e = expected[i];
        pruefeFassung(r.original, e.original || e);
        pruefeFassung(r.ueberarbeitet, e.ueberarbeitet || e);
        assert.deepEqual([...new Set(r.quellen.map(q => q.seite))].sort(), e.quellseiten || [1], 'Quellseiten');
        assert.equal(r.zuordnungUnsicher, !!e.zuordnungUnsicher, 'Zuordnung');
        assert.equal(r.fotos.length, e.fotos?.length || 0, 'Gerichtsfotoanzahl');
        if (e.fotos) assert.deepEqual(r.fotos, e.fotos, 'Gerichtsfoto-Zuordnung und Koordinaten');
        if (e.aenderungen) assert.deepEqual(r.aenderungen, e.aenderungen, 'Einzeländerungen');
        if (e.unsicherheiten) assert.deepEqual(r.unsicherheiten, e.unsicherheiten, 'Unsicherheiten erhalten');
        for (const note of e.notizenEnthalten || []) assert.ok(normalisiereText(r.notizen).includes(normalisiereText(note)), 'Notiz fehlt: ' + note);
    });
}
