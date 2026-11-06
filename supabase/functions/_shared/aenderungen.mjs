// Wort-Diff mit Hirschberg-LCS: linearer Speicher statt quadratischer Matrix.
// Positionen sind UTF-16-Offsets wie String.slice im Browser.
export function textDifferenz(alt, neu) {
    const token = s => s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
    const a = token(alt), b = token(neu);
    const pa = [0], pb = [0];
    a.forEach(t => pa.push(pa.at(-1) + t.length));
    b.forEach(t => pb.push(pb.at(-1) + t.length));
    const matches = [];
    function row(as, ae, bs, be, reverse) {
        let previous = new Uint16Array(be - bs + 1);
        for (let i = 0; i < ae - as; i++) {
            const next = new Uint16Array(previous.length);
            for (let j = 1; j < next.length; j++) {
                next[j] = a[reverse ? ae - 1 - i : as + i] === b[reverse ? be - j : bs + j - 1]
                    ? previous[j - 1] + 1 : Math.max(previous[j], next[j - 1]);
            }
            previous = next;
        }
        return previous;
    }
    function lcs(as, ae, bs, be) {
        while (as < ae && bs < be && a[as] === b[bs]) matches.push([as++, bs++]);
        let suffix = 0;
        while (as < ae - suffix && bs < be - suffix && a[ae - 1 - suffix] === b[be - 1 - suffix]) suffix++;
        const endA = ae - suffix, endB = be - suffix;
        if (as < endA && bs < endB) {
            if (endA - as === 1) {
                for (let j = bs; j < endB; j++) if (a[as] === b[j]) { matches.push([as, j]); break; }
            } else {
                const mid = (as + endA) >> 1;
                const left = row(as, mid, bs, endB, false), right = row(mid, endA, bs, endB, true);
                let split = 0, best = -1;
                for (let j = 0; j <= endB - bs; j++) {
                    const score = left[j] + right[endB - bs - j];
                    if (score > best) { best = score; split = j; }
                }
                lcs(as, mid, bs, bs + split);
                lcs(mid, endA, bs + split, endB);
            }
        }
        for (let k = suffix; k > 0; k--) matches.push([ae - k, be - k]);
    }
    lcs(0, a.length, 0, b.length);
    const edits = [], equal = [];
    let ai = 0, bi = 0;
    for (const [i, j] of [...matches, [a.length, b.length]]) {
        if (i > ai || j > bi) edits.push({ oldStart: pa[ai], oldEnd: pa[i], start: pb[bi], end: pb[j], removed: alt.slice(pa[ai], pa[i]) });
        if (i < a.length) equal.push({ oldStart: pa[i], oldEnd: pa[i + 1], start: pb[j], end: pb[j + 1] });
        ai = i + 1; bi = j + 1;
    }
    return { edits, equal };
}

export function markierungenBerechnen(alt, neu, bisher, person, now = Date.now()) {
    const result = [];
    for (const feld of ['name', 'text', 'kalorien', 'protein', 'kohlenhydrate', 'fett', 'bild_pfad']) {
        const marks = bisher.filter(m => m.feld === feld && Date.parse(m.ablauf_am) > now);
        if (alt[feld] === neu[feld]) { result.push(...marks); continue; }
        if (feld === 'name' || feld === 'text') {
            const { edits, equal } = textDifferenz(alt[feld], neu[feld]);
            for (const mark of marks) {
                const ranges = mark.bereiche || [{ start: mark.start_pos, end: mark.ende_pos }];
                const kept = [];
                for (const range of ranges) {
                    if (range.start === range.end) {
                        // Eine frühere Löschung bleibt am verschobenen Anker, sofern dieser nicht neu bearbeitet wurde.
                        if (edits.some(e => e.oldStart <= range.start && e.oldEnd >= range.end)) continue;
                        const anchor = equal.find(e => e.oldStart <= range.start && e.oldEnd >= range.end);
                        if (anchor) kept.push({ start: anchor.start + range.start - anchor.oldStart, end: anchor.start + range.start - anchor.oldStart });
                    } else {
                        for (const e of equal) {
                            const start = Math.max(e.oldStart, range.start), end = Math.min(e.oldEnd, range.end);
                            if (start < end) {
                                const part = { start: e.start + start - e.oldStart, end: e.start + end - e.oldStart };
                                if (kept.at(-1)?.end === part.start) kept.at(-1).end = part.end;
                                else kept.push(part);
                            }
                        }
                    }
                }
                if (kept.length) result.push({ ...mark, bereiche: kept, start_pos: kept[0].start, ende_pos: kept[0].end });
            }
            if (person !== alt.erstellt_von) {
                for (const e of edits) result.push({ id: crypto.randomUUID(), feld, start_pos: e.start, ende_pos: e.end,
                    bereiche: [{ start: e.start, end: e.end }], alter_text: e.removed, autor_id: person });
            }
        } else if (person !== alt.erstellt_von) {
            result.push({ id: crypto.randomUUID(), feld, start_pos: 0, ende_pos: 0, alter_text: feld === 'bild_pfad' ? '' : String(alt[feld] ?? '—'), autor_id: person });
        }
    }
    return result;
}
