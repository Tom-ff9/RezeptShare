
"use strict";

(() => {
  const KI_URL =
    "https://pwrrqwojvjoyclfmebnl.supabase.co/functions/v1/ki-assistent";

  // Öffentlicher Publishable Key von Supabase-Projekt B.
  // NIEMALS den secret/service_role Key einsetzen.
  const KI_PUBLIC_KEY = "sb_publishable_-ql3ps2lnSnKtmJKeKK2Fg_EESrNR4j";

  const form = document.querySelector("#ki-formular");
  const input = document.querySelector("#ki-eingabe");
  const output = document.querySelector("#ki-nachrichten");
  const status = document.querySelector("#ki-status");
  const sendButton = document.querySelector("#ki-senden");
  const newButton = document.querySelector("#ki-neuer-chat");

  if (!form || !input || !output) return;

  let messages = [];
  let loading = false;

  async function kiAnfrage(nachrichten) {
    if (KI_PUBLIC_KEY === "HIER_PUBLISHABLE_KEY_EINTRAGEN") {
      throw new Error("Der KI-Publishable-Key fehlt.");
    }
    if (!supabaseClient) throw new Error("Bitte melde dich bei RezeptShare an.");
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
      throw new Error("Bitte melde dich erneut bei RezeptShare an.");
    }
    const response = await fetch(KI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": KI_PUBLIC_KEY,
        "Authorization": `Bearer ${data.session.access_token}`
      },
      body: JSON.stringify({ messages: nachrichten })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    if (typeof result.answer !== "string" || !result.answer.trim()) {
      throw new Error("Keine gueltige KI-Antwort.");
    }
    return result.answer;
  }

  // Rezeptkarten erhalten eine eigenstaendige Anfrage ohne Chatverlauf.
  // Dadurch bleibt der normale Chatverlauf unveraendert.
  window.rezeptKIAnfrage = async function (frage) {
    if (loading) throw new Error("Bitte warte, bis die vorherige Anfrage abgeschlossen ist.");
    return kiAnfrage([{ role: "user", content: frage }]);
  };



  function showMessage(role, content) {
    const message = document.createElement("div");
    message.className = "ki-nachricht " +
      (role === "user" ? "ki-user" : "ki-bot");

    const title = document.createElement("strong");
    title.textContent =
      role === "user" ? "Du" : "Rezept-Assistent";

    const body = document.createElement("div");
    body.className = "ki-nachricht-text";

    // KI-Antworten niemals als HTML ausführen.
    body.textContent = content;

    message.append(title, body);
    output.append(message);
    if (role === "assistant" && window.RezeptShareKIV2) {
      window.RezeptShareKIV2.attach(message, content);
    }
    output.scrollTop = output.scrollHeight;
  }

  function setLoading(value) {
    loading = value;
    sendButton.disabled = value;
    newButton.disabled = value;
    input.disabled = value;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loading) return;

    const question = input.value.trim();
    if (!question) return;

    setLoading(true);
    status.textContent = "Der Assistent sucht ...";

    try {
      const nextMessages = [
        ...messages,
        { role: "user", content: question }
      ].slice(-12);

      const answer = await kiAnfrage(nextMessages);

      // Erst nach Erfolg den Chatverlauf ergänzen.
      output.querySelector(".ki-begruessung")?.remove();
      showMessage("user", question);
      showMessage("assistant", answer);

      messages = [
        ...nextMessages,
        { role: "assistant", content: answer }
      ].slice(-12);

      input.value = "";
      status.textContent = "";

    } catch (err) {
      console.error("KI-Fehler:", err);
      status.textContent =
        err.message || "Die KI-Anfrage ist fehlgeschlagen.";
    } finally {
      setLoading(false);
    }
  });

  newButton.addEventListener("click", () => {
    if (loading) return;

    messages = [];
    output.replaceChildren();
    input.value = "";
    status.textContent = "";

    const greeting = document.createElement("p");
    greeting.className = "ki-begruessung";
    greeting.textContent =
      "Neuer Chat – was möchtest du kochen?";

    output.append(greeting);
    input.focus();
  });
})();


function beispielFragenEinrichten() {
  const formular = document.getElementById("ki-formular");
  const eingabe = formular?.querySelector("textarea");

  if (!formular || !eingabe) return;

  if (document.getElementById("ki-beispielfragen")) return;

  const kategorien = {
    "🥔 Zutaten kombinieren": [
      "Welche Rezepte mit Kartoffeln und Feta kennst du?",
      "Was kann ich mit Lachs und Reis kochen?",
      "Zeige mir Rezepte mit Pilzen und Sahne."
    ],

    "🥗 Vegetarisch & vegan": [
      "Zeige mir vegetarische Rezepte mit Kartoffeln.",
      "Ich suche vegane Gerichte mit Pilzen.",
      "Welche veganen Rezepte mit Reis kennst du?"
    ],

    "🌾 Glutenfrei & ohne Allergene": [
      "Welche glutenfreien Rezepte mit Reis gibt es?",
      "Zeige mir Gerichte ohne Milchprodukte.",
      "Ich suche Rezepte ohne Erdnüsse und Eier."
    ],

    "💡 Weitere Inspiration": [
      "Was kann ich heute Abend kochen?",
      "Zeige mir einfache Gerichte mit wenigen Zutaten.",
      "Welche Gerichte kann ich mit Zucchini zubereiten?"
    ]
  };

  const bereich = document.createElement("div");
  bereich.id = "ki-beispielfragen";

  const ueberschrift = document.createElement("h3");
  ueberschrift.textContent =
    "Was kann ich den KI-Assistenten fragen?";

  bereich.appendChild(ueberschrift);

  for (const [kategorie, fragen] of Object.entries(kategorien)) {
    const titel = document.createElement("h4");
    titel.textContent = kategorie;
    bereich.appendChild(titel);

    const liste = document.createElement("div");
    liste.className = "ki-beispiel-liste";

    for (const frage of fragen) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "ki-beispiel-button";
      button.textContent = frage;

      button.addEventListener("click", () => {
        eingabe.value = frage;
        eingabe.dispatchEvent(
          new Event("input", { bubbles: true })
        );
        eingabe.focus();
      });

      liste.appendChild(button);
    }

    bereich.appendChild(liste);
  }

  // Beispiel-Fragen unter dem gesamten Formular platzieren.
  formular.insertAdjacentElement("afterend", bereich);
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    beispielFragenEinrichten
  );
} else {
  beispielFragenEinrichten();
}
