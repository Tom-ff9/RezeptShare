// Gemeinsamer Vertrag für Edge Function, Vorschau und Tests. Keine HTML-Inhalte.
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = (maxLength = 4000) => ({ type: 'string', maxLength });
const arr = (items, maxItems = 100) => ({ type: 'array', items, maxItems });
const page = { type: 'integer', minimum: 1, maximum: 6 };
const number = { type: ['number', 'null'], minimum: 0, maximum: 100000 };
const nutrition = obj({ kalorien: number, protein: number, kohlenhydrate: number, fett: number, quelle: str(500) });
const version = obj({ name: str(120), zutaten: str(8000), zubereitung: str(8000), naehrwerte: nutrition });
const coordinate = { type: 'number', minimum: 0, maximum: 1 };
export const importSchema = obj({
    hinweise: arr(str(1000), 30),
    rezepte: arr(obj({
        original: version, ueberarbeitet: version,
        quellen: arr(obj({ seite: page, stelle: str(1000) }), 30),
        zuordnungUnsicher: { type: 'boolean' },
        unsicherheiten: arr(str(1000), 50),
        notizen: str(4000),
        aenderungen: arr(obj({ feld: str(100), vorher: str(2000), nachher: str(2000), hinweis: str(1000), unsicher: { type: 'boolean' } }), 50),
        fotos: arr(obj({ seite: page, x: coordinate, y: coordinate, breite: coordinate, hoehe: coordinate, unsicher: { type: 'boolean' } }), 12)
    }), 20)
});

function validate(value, schema) {
    const types = [].concat(schema.type);
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(type) && !(types.includes('integer') && Number.isSafeInteger(value))) throw new Error('Ungültiges Erkennungsformat.');
    if (type === 'object') {
        if (Object.keys(value).some(k => !Object.hasOwn(schema.properties, k)) || schema.required.some(k => !Object.hasOwn(value, k))) throw new Error('Unvollständige Erkennungsdaten.');
        for (const [key, definition] of Object.entries(schema.properties)) validate(value[key], definition);
    }
    if (type === 'array') {
        if (value.length > schema.maxItems) throw new Error('Zu viele Erkennungsdaten.');
        value.forEach(v => validate(v, schema.items));
    }
    if (type === 'string' && value.length > schema.maxLength) throw new Error('Erkannter Text ist zu lang.');
    if (type === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) throw new Error('Ungültige Zahl in Erkennungsdaten.');
}
export function importPruefen(value, seitenzahl) {
    validate(value, importSchema);
    for (const r of value.rezepte) {
        if (!r.quellen.length || r.quellen.some(q => q.seite > seitenzahl)) throw new Error('Rezept ohne gültige Quellseite.');
        for (const f of r.fotos) {
            if (f.seite > seitenzahl || f.breite <= 0 || f.hoehe <= 0 || f.x + f.breite > 1.001 || f.y + f.hoehe > 1.001) throw new Error('Ungültiger Bildausschnitt.');
        }
        for (const v of [r.original, r.ueberarbeitet]) {
            if (Object.entries(v.naehrwerte).some(([k, n]) => k !== 'quelle' && n !== null) && !v.naehrwerte.quelle.trim()) throw new Error('Nährwerte ohne Quellenangabe.');
        }
    }
    return value;
}
export function rezeptText(v) {
    return 'Zutaten\n' + v.zutaten + '\n\nZubereitung\n' + v.zubereitung;
}
export function formularDaten(r, fassung) {
    const v = r[fassung];
    if (!['original', 'ueberarbeitet'].includes(fassung) || !v) throw new Error('Bitte wähle eine Fassung.');
    for (const variant of [r.original, r.ueberarbeitet]) {
        if (variant.name.length > 120) throw new Error('Rezeptname ist zu lang.');
        for (const key of ['kalorien','protein','kohlenhydrate','fett']) {
            const n = variant.naehrwerte[key];
            if (n !== null && (!Number.isFinite(n) || n < 0 || !variant.naehrwerte.quelle.trim())) throw new Error('Nährwerte benötigen gültige Zahlen und eine Quelle pro Portion.');
        }
    }
    const protokoll = '\n\n--- Importprotokoll ---\nQuellen: ' + r.quellen.map(q => 'Seite ' + q.seite + ': ' + q.stelle).join('; ')
        + '\nOriginal: ' + r.original.name + '\n' + rezeptText(r.original)
        + '\n\nÜberarbeitet: ' + r.ueberarbeitet.name + '\n' + rezeptText(r.ueberarbeitet)
        + '\n\nNährwerte Original: ' + JSON.stringify(r.original.naehrwerte)
        + '\nNährwerte überarbeitet: ' + JSON.stringify(r.ueberarbeitet.naehrwerte)
        + '\nÄnderungen:\n' + r.aenderungen.map(a => a.feld + ': ' + a.vorher + ' → ' + a.nachher + ' (' + a.hinweis + (a.unsicher ? '; unsicher' : '') + ')').join('\n')
        + '\nNotizen: ' + r.notizen + '\nUnsicherheiten: ' + r.unsicherheiten.join('; ') + (r.zuordnungUnsicher ? '\nSeitenzuordnung war unsicher; manuell prüfen.' : '');
    const text = rezeptText(v) + protokoll;
    if (!v.name.trim() || !(v.zutaten + v.zubereitung).trim() || text.length > 20000) throw new Error('Name/Text fehlen oder das Importprotokoll überschreitet 20.000 Zeichen. Bitte Fassungen kürzen oder aufteilen.');
    return { name: v.name, text, ...Object.fromEntries(['kalorien','protein','kohlenhydrate','fett'].map(k => [k, v.naehrwerte[k]])) };
}
export function zusammenfuehren(a, b) {
    const result = structuredClone(a);
    for (const key of ['original', 'ueberarbeitet']) {
        for (const field of ['zutaten', 'zubereitung']) result[key][field] += '\n\n' + b[key][field];
        // Unterschiedliche Bezugsgrößen niemals still vermischen.
        for (const field of ['kalorien','protein','kohlenhydrate','fett']) {
            if (a[key].naehrwerte[field] !== b[key].naehrwerte[field]) result[key].naehrwerte[field] = null;
        }
        result[key].naehrwerte.quelle += '; ' + b[key].naehrwerte.quelle;
    }
    for (const key of ['quellen','aenderungen','unsicherheiten','fotos']) result[key].push(...structuredClone(b[key]));
    result.notizen += '\n' + b.notizen;
    result.zuordnungUnsicher = true;
    result.unsicherheiten.push('Manuell zusammengeführt: Namen, Reihenfolge und Nährwertbezug prüfen.');
    return result;
}
