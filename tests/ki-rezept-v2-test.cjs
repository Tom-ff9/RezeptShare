const assert = require("node:assert/strict");
const { normaliseRecipe, ingredientLine, recipeText, validPortions, extractFromAnswer, parseQuantity, metricIngredients, germanTitle, localizeAnswer } = require("../ki-rezept-v2.js");

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


// Derselbe Antworttyp wird in manchen Browseransichten als langer Text
// mit mehreren Leerzeichen statt Zeilenumbruechen uebermittelt.
const compactSource = sourceAnswer.replace(/\n/g, "   ");
const compactRecipes = extractFromAnswer(compactSource);
assert.equal(compactRecipes.length, 2);
assert.equal(compactRecipes[0].ingredients.length, 3);
assert.equal(compactRecipes[1].steps.length, 2);

// Die Originalrezepte enthalten oft mehrere nummerierte Kochschritte.
const longSteps = sourceAnswer.replace(
  "2. Reis unterrühren, abdecken und ruhen lassen.",
  "2. Reis unterrühren, abdecken und ruhen lassen.   3. Gut umrühren und servieren."
);
assert.equal(extractFromAnswer(longSteps)[0].steps.length, 3);


assert.equal(metricIngredients("1 lb Pilze"), "454 g Pilze");
assert.equal(metricIngredients("4 Unzen weiche Frischkäse"), "113 g weiche Frischkäse");
assert.equal(metricIngredients("1/2 Tasse Schlagsahne"), "120 ml Schlagsahne");
assert.equal(metricIngredients("2 fl oz Sahne"), "59,15 ml Sahne");
assert.equal(metricIngredients("1 gallon Brühe"), "3,79 l Brühe");
assert.equal(metricIngredients("1 cup Mehl"), "240 ml Mehl"); // Volumen, nicht Gramm
assert.equal(metricIngredients("100 g Pilze"), "100 g Pilze");
assert.equal(metricIngredients("500 ml Wasser"), "500 ml Wasser");
assert.equal(metricIngredients("1 Pfund Mehl"), "1 Pfund Mehl"); // nicht eindeutig
assert.equal(germanTitle("Nuts And Cream Stuffed Mushrooms"), "Mit Nüssen und Frischkäse gefüllte Champignons");
assert.equal(germanTitle("Unknown Recipe"), "Unknown Recipe"); // nicht raten
const englishAnswer = [
  "### **1. Nuts And Cream Stuffed Mushrooms**",
  "**Quelle:** [Originalrezept](https://www.food.com/recipe/nuts-and-cream-stuffed-mushrooms-451879)",
  "**Zutaten:**",
  "- 1 lb Pilze",
  "- 4 Unzen weiche Frischkäse",
  "- 1/2 Tasse Schlagsahne",
  "**Kochanleitung:**",
  "1. Pilze füllen und backen."
].join("\n");
const germanAnswer = localizeAnswer(englishAnswer);
assert(germanAnswer.includes("Mit Nüssen und Frischkäse gefüllte Champignons"));
assert(germanAnswer.includes("454 g Pilze"));
assert(germanAnswer.includes("113 g weiche Frischkäse"));
assert(germanAnswer.includes("120 ml Schlagsahne"));
assert(germanAnswer.includes("https://www.food.com/recipe/nuts-and-cream-stuffed-mushrooms-451879"));
const germanCards = extractFromAnswer(germanAnswer);
assert.equal(germanCards.length, 1);
assert.equal(germanCards[0].ingredients[0].quantity, 454);
assert.equal(germanCards[0].ingredients[0].unit, "g");
assert.equal(germanCards[0].title, "Mit Nüssen und Frischkäse gefüllte Champignons");

console.log("KI-Rezept-V2-Tests erfolgreich.");
