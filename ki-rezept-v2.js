/* RezeptShare KI: Strukturierte Rezeptvorschau, Portionen und Formularuebernahme.
 * Die eigentliche Speicherung erfolgt ausschliesslich ueber das bestehende
 * RezeptShare-Formular mit seinen Gruppenrechten und Supabase-Funktionen.
 */
"use strict";
(function (root) {
  const maxRecipes = 5;

  // Kuechenmasse aus US-Rezeptquellen. "cup" und "Tasse" sind Volumen,
  // keine Gramm: Ohne Zutatendichte ist eine Masseneinheit nicht ableitbar.
  const imperial = Object.freeze({
    lb: { factor: 453.59237, unit: "g" },
    lbs: { factor: 453.59237, unit: "g" },
    pound: { factor: 453.59237, unit: "g" },
    pounds: { factor: 453.59237, unit: "g" },
    pfund: null, // Deutsches Pfund ist mehrdeutig; nicht umrechnen.
    oz: { factor: 28.349523125, unit: "g" },
    ounce: { factor: 28.349523125, unit: "g" },
    ounces: { factor: 28.349523125, unit: "g" },
    unze: { factor: 28.349523125, unit: "g" },
    unzen: { factor: 28.349523125, unit: "g" },
    "fl oz": { factor: 29.5735295625, unit: "ml" },
    "fluid ounce": { factor: 29.5735295625, unit: "ml" },
    "fluid ounces": { factor: 29.5735295625, unit: "ml" },
    gal: { factor: 3.785411784, unit: "l" },
    gallon: { factor: 3.785411784, unit: "l" },
    gallons: { factor: 3.785411784, unit: "l" },
    gallone: { factor: 3.785411784, unit: "l" },
    gallonen: { factor: 3.785411784, unit: "l" },
    cup: { factor: 240, unit: "ml" },
    cups: { factor: 240, unit: "ml" },
    tasse: { factor: 240, unit: "ml" },
    tassen: { factor: 240, unit: "ml" },
    tbsp: { factor: 15, unit: "ml" },
    tsp: { factor: 5, unit: "ml" }
  });
  const imperialUnitPattern = /(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(fluid ounces?|fl\.?\s*oz\.?|gallons?|gallonen?|gallone|gal\.?|pounds?|lbs?\.?|ounces?|oz\.?|unzen?|cups?|tassen?|tbsp\.?|tsp\.?)\b/gi;

  function amountNumber(raw) {
    const value = raw.replace(/\s+/g, "").replace(",", ".");
    if (value.includes("/")) {
      const [a, b] = value.split("/").map(Number);
      return b > 0 ? a / b : NaN;
    }
    return Number(value);
  }

  function metricNumber(value) {
    const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: decimals }).format(value);
  }

  function metricIngredients(text) {
    if (typeof text !== "string") return text;
    return text.replace(imperialUnitPattern, (whole, number, rawUnit) => {
      const unit = rawUnit.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
      const conversion = imperial[unit];
      const amount = amountNumber(number);
      if (!conversion || !Number.isFinite(amount) || amount <= 0) return whole;
      const metric = amount * conversion.factor;
      return metricNumber(metric) + " " + conversion.unit;
    });
  }

  // Typische historische Titel koennen ohne zusaetzlichen Modellaufruf
  // uebersetzt werden. Andere Titel soll das KI-Backend auf Deutsch liefern.
  const knownTitles = Object.freeze({
    "nuts and cream stuffed mushrooms": "Mit Nüssen und Frischkäse gefüllte Champignons",
    "gluten free rice chicken stuffing": "Glutenfreie Reis-Hähnchen-Füllung",
    "gluten-free chicken fried brown rice": "Gebratener Naturreis mit Hähnchen (glutenfrei)",
    "no egg fried rice": "Gebratener Reis ohne Ei",
    "gluten-free hot breakfast cereal": "Glutenfreier warmer Frühstücksbrei"
  });
  function germanTitle(title) {
    return knownTitles[title.toLowerCase().trim()] || title;
  }

  function localizeAnswer(answer) {
    if (typeof answer !== "string") return answer;
    // Nur Titelzeilen ersetzen; URLs und Quellen unveraendert lassen.
    const titles = answer.replace(/(#{2,4}\s+\*{0,2}\d+[.)]\s+)([^\r\n*]+)(\*{0,2})/g,
      (whole, prefix, title, suffix) => prefix + germanTitle(title.trim()) + suffix);
    return metricIngredients(titles);
  }

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
    const title = typeof value.title === "string" ? germanTitle(value.title.trim()).slice(0, 120) : "";
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
    if (recipe.allergens) lines.push("", "Allergenhinweis: " + recipe.allergens);
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
      if (recipe.allergens) preview.append(el("p", "", "Allergenhinweis: " + recipe.allergens));
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
    const line = metricIngredients(original.trim());
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
      .replace(/\s*---\s*/g, "\n---\n")
      // Ueberschriften und Abschnittsnamen stehen in einigen Antworten
      // hintereinander ohne Zeilenumbruch.
      .replace(/\s+(?=#{2,4}\s+\*{0,2}\d+[.)]\s)/g, "\n")
      .replace(/\s+(?=\*\*(?:Source|Quelle|Zutaten|Ingredients|Kochanleitung|Zubereitung|Anleitung|Directions|Instructions|Hinweis(?:\s+zu\s+Allergenen)?)\s*:)/gi, "\n")
      .replace(/(\*\*(?:Zutaten|Ingredients|Kochanleitung|Zubereitung|Anleitung|Directions|Instructions)\s*:\*\*)\s*/gi, "$1\n")
      .replace(/\s{2,}(?=-\s+\S)/g, "\n")
      .replace(/\s{2,}(?=\d+[.)]\s+\S)/g, "\n");
    const lines = prepared.split(/\r?\n/).map(line => line.trim());
    const output = [];
    let recipe;
    let section;
    function finish() {
      if (!recipe || output.length >= maxRecipes) return;
      const parsed = normaliseRecipe(recipe);
      if (parsed) {
        if (recipe.allergens.length) parsed.allergens = recipe.allergens.join(" ");
        output.push(parsed);
      }
    }

    for (const line of lines) {
      if (!line) continue;
      if (line === "---") {
        finish();
        recipe = null;
        continue;
      }
      const plain = line.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").trim();
      const label = plain.replace(/:\s*$/, "").trim();
      const ingredients = /^(?:zutaten|ingredients)(?:\s*\([^()]+\))?$/i.test(label);
      const directions = /^(?:koch(?:anleitung)?|zubereitung(?:sschritte)?|anleitung|directions|instructions)$/i.test(label);
      const metadata = plain.match(/^(quellen?|sources?|allergenhinweise?|allergene|hinweise?(?: zu allergenen)?)(?:\s*:\s*(.*)|\s*$)/i);
      const servings = plain.match(/^(?:portionen|portions|personen|servings)\s*[: ]\s*(\d{1,3})\b/i)
        || plain.match(/\b(\d{1,3})\s*(?:portionen|portions|personen|servings)\b/i);

      if (ingredients || directions) {
        section = ingredients ? "ingredients" : "steps";
        if (recipe && ingredients && servings) recipe.base_portions = Number(servings[1]);
      } else if (/^(?:[-*•]\s+)?(?:\[(?:originalrezept|original recipe|quelle|source)\]\(https?:\/\/|https?:\/\/)/i.test(plain)) {
        section = "source";
      } else if (metadata) {
        section = /^(quelle|source)/i.test(metadata[1]) ? "source"
          : /allergen/i.test(metadata[1]) ? "allergens" : "note";
        if (recipe && section === "allergens" && metadata[2]) recipe.allergens.push(metadata[2]);
      } else if (/^(?:portionen|portions|personen|servings)\b/i.test(label) || /^\d+\s+(?:portionen|portions|personen|servings)\b/i.test(label)) {
        if (recipe && servings) recipe.base_portions = Number(servings[1]);
        section = null;
      } else if (/^#{1,6}\s+/.test(line) || /^\*\*[^*]+\*\*$/.test(line)) {
        finish();
        recipe = { title: plain.replace(/^\d+[.)]\s+/, ""), ingredients: [], steps: [], allergens: [], base_portions: servings ? Number(servings[1]) : null };
        section = null;
      } else if (recipe) {
        const item = line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
        if (section === "ingredients") recipe.ingredients.push(parseQuantity(item));
        if (section === "steps" && !/^https?:\/\//i.test(item)) recipe.steps.push(item);
        if (section === "allergens") recipe.allergens.push(item);
      }
      if (recipe && section === "source" && !recipe.source_url) {
        recipe.source_url = line.match(/https?:\/\/[^\s)\]>]+/i)?.[0];
      }
    }
    finish();
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
    if (!message || !answer) return;
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
        const recipes = extractFromAnswer(answer);
        if (!recipes.length) {
          feedback.textContent = "Die Antwort konnte nicht zuverlässig in Rezeptkarten zerlegt werden. Bitte frage nach einzelnen Rezepten mit getrennten Zutaten und nummerierter Anleitung.";
          return;
        }
        feedback.textContent = "KI-extrahierte Angaben bitte vor dem Speichern überprüfen.";
        for (const recipe of recipes) holder.append(showRecipeCard(recipe));
      } catch (err) {
        feedback.textContent = "Rezeptkarten konnten nicht erstellt werden: " + (err.message || "Unbekannter Fehler");
      } finally { button.disabled = false; }
    });
  }

  const api = { attach, normaliseRecipe, ingredientLine, recipeText, validPortions, readJson, extractFromAnswer, parseQuantity, metricIngredients, germanTitle, localizeAnswer };
  root.RezeptShareKIV2 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
