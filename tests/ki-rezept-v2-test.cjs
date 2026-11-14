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
assert.equal(parsed[0].steps.length, 2);
assert.equal(extractFromAnswer("Keine passenden Rezepte gefunden.").length, 0);

console.log("KI-Rezept-V2-Tests erfolgreich.");
