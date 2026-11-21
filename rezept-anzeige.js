(function (root) {
    "use strict";

    const headingTypes = new Map([
        ["zutaten", "ingredients"], ["zutatenliste", "ingredients"],
        ["zubereitung", "steps"], ["zubereitungsschritte", "steps"],
        ["kochanleitung", "steps"], ["kochschritte", "steps"],
        ["notizen", "notes"], ["hinweise", "notes"], ["tipps", "notes"],
        ["beilage", "notes"], ["beilagen", "notes"]
    ]);

    function linesOf(source) {
        const lines = [];
        const re = /[^\r\n\u2028\u2029]*/g;
        let match;
        while ((match = re.exec(source))) {
            if (match[0].length) lines.push({ text: match[0], start: match.index, end: match.index + match[0].length });
            if (re.lastIndex >= source.length) break;
            const separator = source[re.lastIndex];
            re.lastIndex += separator === "\r" && source[re.lastIndex + 1] === "\n" ? 2 : 1;
        }
        return lines;
    }

    function heading(line) {
        const trimmed = line.text.trim();
        const match = trimmed.match(/^(?:#{1,6}\s*)?(?:\*\*)?([^:*#]+?)(?:\*\*)?\s*:?[ \t]*$/);
        if (!match) return null;
        return headingTypes.get(match[1].trim().toLocaleLowerCase("de")) || null;
    }

    function contentLine(line) {
        const leading = line.text.length - line.text.trimStart().length;
        const trimmed = line.text.trim();
        const bullet = trimmed.match(/^(?:[-*•]\s+)(.*)$/);
        const removed = bullet ? bullet[0].length - bullet[1].length : 0;
        return { text: bullet ? bullet[1].trimEnd() : trimmed, start: line.start + leading + removed };
    }

    function groupParagraphs(lines) {
        const groups = [];
        let current = [];
        for (const line of lines) {
            if (!line.text.trim()) {
                if (current.length) groups.push(current), current = [];
            } else current.push(line);
        }
        if (current.length) groups.push(current);
        return groups;
    }

    function parseIngredients(lines) {
        const items = [];
        const adjectiveSuffixes = new Set(["edelsüß", "süß", "scharf", "geräuchert", "gemahlen"]);
        for (const raw of lines.filter(line => line.text.trim())) {
            const firstItemOnLine = items.length;
            const item = contentLine(raw);
            if (!item.text) continue;
            const parts = item.text.split(/,\s+/);
            const quantifiedParts = parts.filter(part => /^\d+(?:[.,]\d+)?(?:\s|[-–/])/u.test(part)).length;
            // Split only comma-delimited lists with several plausible ingredient entries.
            // Two-part phrases remain intact (for example "Paprika, edelsüß").
            if (parts.length < 3 || (quantifiedParts < 2 && parts.length < 4)) {
                items.push(item);
                continue;
            }
            let offset = item.start;
            for (const part of parts) {
                const start = raw.text.indexOf(part, offset - raw.start);
                const partStart = raw.start + Math.max(0, start);
                const normalized = part.trim();
                if (adjectiveSuffixes.has(normalized.toLocaleLowerCase("de")) && items.length > firstItemOnLine) {
                    items[items.length - 1].text += ", " + normalized;
                } else if (normalized) items.push({ text: normalized, start: partStart });
                offset = partStart + part.length;
            }
        }
        return items;
    }

    function parseSteps(lines) {
        const paragraphs = groupParagraphs(lines);
        const items = [];
        for (const paragraph of paragraphs) {
            let item = null;
            for (const line of paragraph) {
                const trimmed = line.text.trim();
                const indent = line.text.length - line.text.trimStart().length;
                const numbered = trimmed.match(/^(\d{1,3})[.)]\s+(.*)$/);
                const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
                if (numbered || bullet) {
                    if (item) items.push(item);
                    const prefix = numbered ? numbered[0].length - numbered[2].length : bullet[0].length - bullet[1].length;
                    const body = numbered ? numbered[2] : bullet[1];
                    item = { text: body, start: line.start + indent + prefix };
                } else if (!item) item = contentLine(line);
                else if (/[.!?…][”’\"')\]]*$/.test(item.text.trim())) {
                    items.push(item);
                    item = contentLine(line);
                } else item.text += "\n" + trimmed;
            }
            if (item) items.push(item);
        }
        return items;
    }

    function rezeptTextAufteilen(value) {
        const source = String(value ?? "");
        const lines = linesOf(source);
        const headings = [];
        lines.forEach((line, index) => {
            const type = heading(line);
            if (type) headings.push({ type, index });
        });
        const ingredientHeading = headings.findIndex(item => item.type === "ingredients");
        const stepHeading = headings.findIndex(item => item.type === "steps");
        if (ingredientHeading < 0 || stepHeading <= ingredientHeading) return { ok: false, original: source };
        if (headings.filter(item => item.type === "ingredients").length !== 1 || headings.filter(item => item.type === "steps").length !== 1) return { ok: false, original: source };
        if (lines.slice(0, headings[ingredientHeading].index).some(line => line.text.trim())) return { ok: false, original: source };

        const sections = [];
        for (let h = ingredientHeading; h < headings.length; h++) {
            const current = headings[h];
            const nextIndex = headings[h + 1]?.index ?? lines.length;
            const content = lines.slice(current.index + 1, nextIndex);
            let items;
            if (current.type === "ingredients") items = parseIngredients(content);
            else if (current.type === "steps") items = parseSteps(content);
            else items = groupParagraphs(content).map(group => ({ text: group.map(line => line.text.trim()).join("\n"), start: group[0].start }));
            if (!items.length) return { ok: false, original: source };
            sections.push({ type: current.type, items });
        }
        const ingredient = sections.find(section => section.type === "ingredients");
        const steps = sections.find(section => section.type === "steps");
        if (!ingredient?.items.length || !steps?.items.length) return { ok: false, original: source };
        return { ok: true, sections };
    }

    root.rezeptTextAufteilen = rezeptTextAufteilen;
    if (typeof module !== "undefined" && module.exports) module.exports = { rezeptTextAufteilen };
})(typeof globalThis !== "undefined" ? globalThis : window);
