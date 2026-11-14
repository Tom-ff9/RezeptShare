/* RezeptShare KI: Strukturierte Rezeptvorschau, Portionen und Formularuebernahme.
 * Die eigentliche Speicherung erfolgt ausschliesslich ueber das bestehende
 * RezeptShare-Formular mit seinen Gruppenrechten und Supabase-Funktionen.
 */
"use strict";
(function (root) {
  const maxRecipes = 5;

  function readJson(answer) {
    if (typeof answer !== "string") throw new Error("Keine Rezeptdaten erhalten.");
    const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : answer;
    try { return JSON.parse(candidate.trim()); }
    catch (_) {
      const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("Die KI hat kein lesbares Rezeptformat geliefert. Bitte erneut versuchen.");
      return JSON.parse(candidate.slice(start, end + 1));
    }
  }

  function normaliseRecipe(value) {
    if (!value || typeof value !== "object") return null;
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 120) : "";
    const steps = Array.isArray(value.steps)
      ? value.steps.filter(s => typeof s === "string" && s.trim()).map(s => s.trim().slice(0, 3000)).slice(0, 40)
      : [];
    const ingredients = Array.isArray(value.ingredients)
      ? value.ingredients.slice(0, 80).map(item => {
          if (!item || typeof item !== "object") return null;
          const name = typeof item.name === "string" ? item.name.trim().slice(0, 250) : "";
          const unit = typeof item.unit === "string" ? item.unit.trim().slice(0, 30) : "";
          const original = typeof item.original === "string" ? item.original.trim().slice(0, 350) : "";
          // Nur eindeutig numerische Mengen duerfen mathematisch skaliert werden.
          const n = item.quantity === null || item.quantity === undefined || item.quantity === ""
            ? null : Number(item.quantity);
          const quantity = n !== null && Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
          return name ? { name, unit, original: original || name, quantity } : null;
        }).filter(Boolean)
      : [];
    const rawPortions = Number(value.base_portions);
    const basePortions = Number.isInteger(rawPortions) && rawPortions > 0 && rawPortions <= 100
      ? rawPortions : null;
    const rawUrl = typeof value.source_url === "string" ? value.source_url.trim() : "";
    let sourceUrl = "";
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "https:" || url.protocol === "http:") sourceUrl = url.href;
    } catch (_) { /* Keine gueltige externe Quelle */ }
    if (!title || !ingredients.length || !steps.length) return null;
    return { title, basePortions, ingredients, steps, sourceUrl };
  }

  function formatNumber(number) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(number);
  }

  function ingredientLine(item, basePortions, targetPortions) {
    if (item.quantity === null || !basePortions || !targetPortions) {
      return item.original || [item.name, item.unit].filter(Boolean).join(" ");
    }
    const scaled = item.quantity * targetPortions / basePortions;
    return [formatNumber(scaled), item.unit, item.name].filter(Boolean).join(" ");
  }

  function recipeText(recipe, base, target) {
    const lines = [
      "Portionen: " + (target || base || "nicht angegeben"),
      "", "Zutaten:",
      ...recipe.ingredients.map(i => "- " + ingredientLine(i, base, target)),
      "", "Zubereitung:",
      ...recipe.steps.map((step, i) => (i + 1) + ". " + step),
    ];
    if (recipe.sourceUrl) lines.push("", "Quelle: " + recipe.sourceUrl);
    return lines.join("\n");
  }

  function validPortions(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showRecipeCard(recipe) {
    const card = el("article", "ki-rezept-karte");
    card.append(el("h4", "", recipe.title));
    const controls = el("div", "ki-portionen");
    const baseLabel = el("label", "", "Ausgangsportionen");
    const baseInput = el("input");
    baseInput.type = "number"; baseInput.min = "1"; baseInput.max = "100";
    baseInput.value = recipe.basePortions || "";
    baseInput.placeholder = "Angeben";
    baseLabel.append(baseInput);
    const targetLabel = el("label", "", "Gewünschte Portionen");
    const targetInput = el("input");
    targetInput.type = "number"; targetInput.min = "1"; targetInput.max = "100";
    targetInput.value = recipe.basePortions || "";
    targetLabel.append(targetInput);
    controls.append(baseLabel, targetLabel);
    card.append(controls);
    const hint = el("p", "ki-rezept-hinweis");
    const preview = el("div", "ki-rezept-vorschau");
    const actions = el("div", "ki-rezept-aktionen");
    const importButton = el("button", "primaer-button", "In meine Rezepte übernehmen");
    importButton.type = "button";
    const feedback = el("p", "ki-rezept-feedback");
    feedback.setAttribute("role", "status");
    actions.append(importButton);
    card.append(hint, preview, actions, feedback);

    function update() {
      const base = validPortions(baseInput.value);
      const target = validPortions(targetInput.value);
      const canScale = !!base && !!target;
      const original = !baseInput.value && !targetInput.value;
      importButton.disabled = !canScale && !original;
      hint.textContent = canScale
        ? "Mengen werden proportional umgerechnet. Bitte Zutaten und Einheiten vor dem Speichern prüfen."
        : original
          ? "Keine Portionszahl im Rezept angegeben: Du kannst das Rezept unverändert übernehmen oder beide Portionsfelder für eine Umrechnung ausfüllen."
          : "Bitte beide Portionsfelder angeben oder beide leer lassen, um die Originalmengen zu übernehmen.";
      preview.replaceChildren();
      const heading = el("h5", "", "Zutaten");
      const list = el("ul");
      for (const item of recipe.ingredients) list.append(el("li", "", ingredientLine(item, base, target)));
      const directions = el("h5", "", "Zubereitung");
      const ordered = el("ol");
      for (const step of recipe.steps) ordered.append(el("li", "", step));
      preview.append(heading, list, directions, ordered);
      if (recipe.sourceUrl) {
        const a = el("a", "", "Originalrezept");
        a.href = recipe.sourceUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
        preview.append(a);
      }
    }
    baseInput.addEventListener("input", update);
    targetInput.addEventListener("input", update);
    importButton.addEventListener("click", async () => {
      const base = validPortions(baseInput.value), target = validPortions(targetInput.value);
      if ((!base || !target) && (baseInput.value || targetInput.value)) return;
      importButton.disabled = true;
      feedback.textContent = "";
      try {
        if (typeof root.rezeptShareKIRezeptUebernehmen !== "function") {
          throw new Error("Die Rezeptverwaltung ist nicht bereit. Bitte Seite neu laden.");
        }
        const text = recipeText(recipe, base, target);
        const accepted = await root.rezeptShareKIRezeptUebernehmen({ name: recipe.title, text });
        if (accepted) feedback.textContent = "Rezept ins Formular übernommen. Bitte prüfen und selbst speichern.";
      } catch (err) {
        feedback.textContent = err.message || "Übernahme fehlgeschlagen.";
      } finally { update(); }
    });
    update();
    return card;
  }

  function parseQuantity(original) {
    const line = original.trim();
    const match = line.match(/^(\d+\/\d+|\d+(?:[.,]\d+)?)\s*(kg|g|mg|ml|l|EL|TL|Esslöffel|Teelöffel|Tassen?|Becher|Prisen?|St(?:ue|ü)ck|cups?|tbsp|tsp|pcs?)?\s+(.+)$/i);
    if (!match) return { name: line, quantity: null, unit: "", original: line };
    let amount;
    if (match[1].includes("/")) {
      const [a, b] = match[1].split("/").map(Number);
      amount = b ? a / b : NaN;
    } else {
      amount = Number(match[1].replace(",", "."));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { name: line, quantity: null, unit: "", original: line };
    }
    return { name: match[3].trim(), quantity: amount, unit: match[2] || "", original: line };
  }

  // Direkte Erkennung ueblicher Chatantworten: keine weitere KI-Abfrage noetig.
  // Wenn die Antwort keine vollstaendigen Rezepte enthaelt, wird kein
  // vermeintlich vollstaendiges Rezept erzeugt.
  function extractFromAnswer(answer) {
    if (typeof answer !== "string" || !answer.trim()) return [];

    // Die Assistentenantworten verwenden teilweise Markdown mit fettgedruckten
    // Ueberschriften und teilweise durchgehende Textzeilen.
    const prepared = answer
      .replace(/\\\*/g, "*")
      .replace(/(#{2,4}\s*\*{0,2}\d+[.)]\s+)/g, "\n$1")
      .replace(/\s+\*\*(Zutaten|Ingredients|Kochanleitung|Zubereitung|Anleitung|Directions|Instructions)\s*:\*\*/gi, "\n**$1:**\n")
      .replace(/\s+---\s+/g, "\n---\n");
    const lines = prepared.split(/\r?\n/).map(line => line.trim());
    const section = line => line.replace(/^#{1,5}\s*/, "").replace(/\*\*/g, "").replace(/:$/, "").trim().toLowerCase();
    const titleOf = line => {
      const clean = line.replace(/\\\*/g, "*").trim();
      const numbered = clean.match(/^#{2,4}\s+\*{0,2}(\d+)[.)]\s+(.+?)(?:\*{2})?\s*$/)
        || clean.match(/^\*{2}(\d+)[.)]\s+(.+?)\*{2}\s*$/);
      if (numbered) return numbered[2].replace(/^\*\*|\*\*$/g, "").trim();
      const normal = clean.match(/^#{2,4}\s+(.+)$/);
      const title = normal && normal[1].replace(/\*\*/g, "").trim();
      return title && !/^(Zutaten|Ingredients|Kochanleitung|Zubereitung|Anleitung|Directions|Instructions|Quelle|Source)\b/i.test(title) ? title : null;
    };

    const segments = [];
    let current = [];
    for (const line of lines) {
      const title = titleOf(line);
      if (title && current.some(l => titleOf(l))) {
        segments.push(current);
        current = [];
      }
      if (line === "---" && current.some(l => titleOf(l))) {
        segments.push(current);
        current = [];
        continue;
      }
      current.push(line);
    }
    if (current.length) segments.push(current);

    const output = [];
    for (const segment of segments) {
      const heading = segment.find(titleOf);
      const title = heading && titleOf(heading);
      if (!title) continue;
      const ingredientIndex = segment.findIndex(line => /^(zutaten|ingredients)$/i.test(section(line)));
      const directionIndex = segment.findIndex(line => /^(koch(?:anleitung)?|zubereitung|anleitung|directions|instructions|zubereitungsschritte)$/i.test(section(line)));
      if (ingredientIndex < 0 || directionIndex <= ingredientIndex) continue;

      const ingredientLines = segment.slice(ingredientIndex + 1, directionIndex)
        .map(line => line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
        .filter(line => line && !/^(Quelle|Source|Hinweis)\s*:/i.test(line) && !/^https?:\/\//.test(line));

      const steps = [];
      for (const line of segment.slice(directionIndex + 1)) {
        if (/^\*{0,2}(?:Hinweis|Quelle|Source|Allergene|Allergenhinweis)\s*:/i.test(line)) break;
        if (!line || line === "---") continue;
        const step = line.replace(/^\d+[.)]\s*/, "").replace(/^[-*•]\s*/, "").trim();
        if (step.length > 5 && !/^https?:\/\//i.test(step)) steps.push(step);
      }
      const before = segment.slice(0, directionIndex).join(" ");
      const portionMatch = before.match(/(?:portionen|portions|personen|servings)\s*:\s*(\d{1,3})\b/i)
        || before.match(/\b(\d{1,3})\s*(?:portionen|portions|personen|servings)\b/i);
      // Markdown-Quellverweis: [Originalrezept](https://...).
      const sourceLine = segment.find(line => /(?:source|quelle)\s*:/i.test(line)) || "";
      const sourceMatch = sourceLine.match(/https?:\/\/[^\s)\]>]+/i);
      const parsed = normaliseRecipe({
        title,
        base_portions: portionMatch ? Number(portionMatch[1]) : null,
        ingredients: ingredientLines.map(parseQuantity),
        steps,
        source_url: sourceMatch ? sourceMatch[0] : ""
      });
      if (parsed) output.push(parsed);
      if (output.length >= maxRecipes) break;
    }
    return output;
  }

  function promptForRecipes(answer) {
    return `Extrahiere aus dem folgenden Text bis zu 5 TATSAECHLICH genannte Rezepte.
Antworte ausschliesslich mit einem JSON-Objekt ohne Markdown oder Erklaerung.
Format:
{"recipes":[{"title":"Titel","base_portions":null,"ingredients":[{"name":"Zutat","quantity":null,"unit":"","original":"Originalangabe"}],"steps":["Schritt 1"],"source_url":""}]}
Regeln:
- Keine neuen Rezepte oder Zutaten erfinden.
- Nur Rezepttitel, Zutaten und Zubereitungsschritte aus dem gelieferten Text verwenden.
- Wenn keine vollstaendige Zutatenliste UND Anleitung vorhanden sind, Rezept weglassen.
- base_portions nur als positive Ganzzahl, wenn die Ausgangsportionen ausdruecklich genannt sind; sonst null.
- quantity nur als Zahl, wenn die Menge eindeutig numerisch ist; sonst null.
- original muss die urspruengliche Zutatenzeile enthalten.
- source_url nur aus der Vorlage uebernehmen.
- Falls kein vollstaendiges Rezept enthalten ist: {"recipes":[]}.
Hier ist der Text:
${answer.slice(0, 18000)}`;
  }

  function attach(message, answer) {
    if (!message || !answer || typeof root.rezeptKIAnfrage !== "function") return;
    const button = el("button", "sekundaer-button ki-strukturieren", "Rezeptkarten aus dieser Antwort erstellen");
    button.type = "button";
    const feedback = el("p", "ki-rezept-feedback");
    feedback.setAttribute("role", "status");
    const holder = el("div", "ki-rezept-karten");
    message.append(button, feedback, holder);
    button.addEventListener("click", async () => {
      button.disabled = true;
      feedback.textContent = "Rezeptkarten werden vorbereitet ...";
      holder.replaceChildren();
      try {
        let recipes = extractFromAnswer(answer);
        if (!recipes.length) {
          const raw = await root.rezeptKIAnfrage(promptForRecipes(answer));
          const data = readJson(raw);
          recipes = (Array.isArray(data.recipes) ? data.recipes : [])
            .slice(0, maxRecipes).map(normaliseRecipe).filter(Boolean);
        }
        if (!recipes.length) {
          feedback.textContent = "Aus dieser Antwort konnte kein vollständiges Rezept erkannt werden. Bitte frage gezielt nach einem Rezept mit Zutaten und Anleitung.";
          return;
        }
        feedback.textContent = "KI-extrahierte Angaben bitte vor dem Speichern überprüfen.";
        for (const recipe of recipes) holder.append(showRecipeCard(recipe));
      } catch (err) {
        feedback.textContent = "Rezeptkarten konnten nicht erstellt werden: " + (err.message || "Unbekannter Fehler");
      } finally { button.disabled = false; }
    });
  }

  const api = { attach, normaliseRecipe, ingredientLine, recipeText, validPortions, readJson, extractFromAnswer, parseQuantity };
  root.RezeptShareKIV2 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
