export function rezept(name = 'Kuchen', seite = 1) {
    const original = { name, zutaten: '200 g Mehl\n100 g Zucker', zubereitung: 'Verrühren und backen.', naehrwerte: { kalorien: null, protein: null, kohlenhydrate: null, fett: null, quelle: '' } };
    return { original, ueberarbeitet: { ...structuredClone(original), zutaten: '200 g Mehl\n80 g Zucker' },
        quellen: [{ seite, stelle: 'Linke Spalte' }], zuordnungUnsicher: false,
        unsicherheiten: ['Randnotiz Backzeit [unleserlich]'], notizen: 'Handschrift: weniger süß',
        aenderungen: [{ feld: 'Zucker', vorher: '100 g', nachher: '80 g', hinweis: '100 durchgestrichen, 80 handschriftlich', unsicher: false }],
        fotos: [{ seite, x: 0.1, y: 0.2, breite: 0.5, hoehe: 0.4, unsicher: false }] };
}
// Kleiner synthetischer JPEG-Header für serverseitige Größenprüfung, kein Modellaufruf.
export const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,11,8,0,100,0,100,1,1,17,0,255,217]).toString('base64');
