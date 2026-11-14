const assert = require("node:assert/strict");
const { normaliseRecipe, ingredientLine, recipeText, validPortions, extractFromAnswer, parseQuantity } = require("../ki-rezept-v2.js");

assert.equal(validPortions(4), 4);
assert.equal(validPortions(0), null);
assert.equal(validPortions(101), null);
assert.equal(validPortions("2.5"), null);

assert.deepEqual(parseQuantity("800 g Kartoffeln"), {
  name: "Kartoffeln", quantity: 800, unit: "g", original: "800 g Kartoffeln"
});
assert.deepEqual(parseQuantity("nach Geschmack Salz"), {
  name: "nach Geschmack Salz", quantity: null, unit: "", original: "nach Geschmack Salz"
});
assert.equal(ingredientLine(parseQuantity("800 g Kartoffeln"), 4, 6), "1.200 g Kartoffeln");
assert.equal(ingredientLine(parseQuantity("nach Geschmack Salz"), 4, 6), "nach Geschmack Salz");

const recipe = normaliseRecipe({
  title: "Kartoffeln mit Rosmarin",
  base_portions: 4,
  ingredients: [{ name: "Kartoffeln", quantity: 800, unit: "g", original: "800 g Kartoffeln" }],
  steps: ["Kartoffeln waschen und schneiden."],
  source_url: "https://example.org/rezept"
});
assert(recipe);
assert(recipeText(recipe, 4, 6).includes("- 1.200 g Kartoffeln"));
assert(recipeText(recipe, 4, 6).includes("Quelle: https://example.org/rezept"));
assert.equal(normaliseRecipe({ title: "Unvollstaendig", ingredients: [], steps: [] }), null);

const message = [
  "### 1. Kartoffeln mit Rosmarin",
  "",
  "Portionen: 4",
  "",
  "**Zutaten:**",
  "- 800 g Kartoffeln",
  "- 2 EL Olivenoel",
  "",
  "**Zubereitung:**",
  "1. Kartoffeln waschen und schneiden.",
  "2. Im Ofen backen und servieren."
].join("\n");
const parsed = extractFromAnswer(message);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].title, "Kartoffeln mit Rosmarin");
assert.equal(parsed[0].ingredients.length, 2);
assert.equal(parsed[0].basePortions, 4);
assert.equal(extractFromAnswer(message.replace("Portionen: 4", "4 Portionen"))[0].basePortions, 4);
assert.equal(extractFromAnswer(message.replace("Portionen: 4", "Portions: 6"))[0].basePortions, 6);
assert.equal(extractFromAnswer(message.replace("Portionen: 4", "Portionen unbekannt"))[0].basePortions, null);
assert.equal(parsed[0].steps.length, 2);
assert.equal(extractFromAnswer("Keine passenden Rezepte gefunden.").length, 0);


const sourceAnswer = [
  "Hier sind glutenfreie Rezepte mit Reis aus der Datenbank:",
  "---",
  "### **1. Gluten Free Rice Chicken Stuffing**",
  "**Source:** [Originalrezept](https://www.allrecipes.com/recipe/230118/gluten-free-rice-chicken-stuffing/)",
  "**Zutaten:**",
  "- 2 Tassen Wasser",
  "- 4 Teelöffel glutenfreie Hähnchenbrühe (Granulat)",
  "- 1/4 Teelöffel Salz",
  "**Kochanleitung:**",
  "1. Wasser und Zutaten in eine Schüssel geben.",
  "2. Reis unterrühren, abdecken und ruhen lassen.",
  "---",
  "### **2. Gluten-free Chicken Fried Brown Rice**",
  "**Source:** [Originalrezept](https://tastykitchen.com/recipes/special-dietary-needs/gluten-free/gluten-free-chicken-fried-brown-rice/)",
  "**Zutaten:**",
  "- 3 Esslöffel Olivenöl",
  "- 1/2 Tasse gehackte rote Zwiebel",
  "- 2 Eier",
  "**Kochanleitung:**",
  "1. Olivenöl in einer Pfanne erhitzen.",
  "2. Eier einrühren und fertig garen.",
  "---",
  "**Hinweis zu Allergenen:** Manche Zutaten müssen geprüft werden."
].join("\n");
const fromSource = extractFromAnswer(sourceAnswer);
assert.equal(fromSource.length, 2);
assert.equal(fromSource[0].title, "Gluten Free Rice Chicken Stuffing");
assert.equal(fromSource[1].title, "Gluten-free Chicken Fried Brown Rice");
assert.equal(fromSource[0].sourceUrl, "https://www.allrecipes.com/recipe/230118/gluten-free-rice-chicken-stuffing/");
assert.equal(fromSource[0].basePortions, null);
assert.equal(fromSource[0].steps.length, 2);
assert.equal(fromSource[0].ingredients[2].quantity, 0.25);
assert.equal(fromSource[1].ingredients[1].quantity, 0.5);
assert.equal(ingredientLine(fromSource[0].ingredients[0], null, null), "2 Tassen Wasser");
assert(recipeText(fromSource[0], null, null).includes("Portionen: nicht angegeben"));

console.log("KI-Rezept-V2-Tests erfolgreich.");
