
"use strict";

(() => {
  const config = window.REZEPT_SHARE_KONFIGURATION || {};
  const KI_URL = config.kiUrl || '';
  const KI_PUBLIC_KEY = config.kiPublishableKey || config.supabasePublishableKey || '';

  // Ausgabeformat: Auch englische Datenbanktitel bei jeder Rezeptantwort
  // ins Deutsche uebersetzen. Quellen-URL und Originalrezept bleiben erhalten.
  const KI_AUSGABE_REGELN = [
    "Antworte ausnahmslos auf Deutsch, auch wenn die Rezeptquelle Englisch ist.",
    "Uebersetze ALLE Rezepttitel sinngemaess ins Deutsche, auch in Markdown-Ueberschriften. Den Originaltitel kannst du in Klammern nennen.",
    "Verwende fuer Gewichte Gramm oder Kilogramm und fuer Fluessigkeiten Milliliter oder Liter.",
    "Rechne US-Masse um: 1 lb = 453,592 g, 1 oz Gewicht = 28,3495 g, 1 US fl oz = 29,5735 ml, 1 US gallon = 3,78541 l.",
    "US cups und Tassen sind Volumen (ca. 240 ml). Ohne bekannte Dichte darf daraus keine Grammangabe berechnet werden.",
    "Behalte Zutaten, Arbeitsschritte, Rezeptidentitaet und originale Quellen-URLs bei; erfinde keine Angaben."
  ].join("\n");

  const PROGRESS_URL = config.kiProgressUrl || '';
  const MAX_MESSAGE_CHARS = 4000;
  const MAX_BODY_BYTES = 50_000;
  const formatSuffix = "\n\n[Antwortformat]\n" + KI_AUSGABE_REGELN;
  const progressSuffixLength = ("\n[REZEPT_PROGRESS_ID:" + "0".repeat(36) + "]").length;
  const maxQuestionChars = MAX_MESSAGE_CHARS - formatSuffix.length - (PROGRESS_URL ? progressSuffixLength : 0);

  const form = document.querySelector("#ki-formular");
  const input = document.querySelector("#ki-eingabe");
  const output = document.querySelector("#ki-nachrichten");
  const status = document.querySelector("#ki-status");
  const sendButton = document.querySelector("#ki-senden");
  const newButton = document.querySelector("#ki-neuer-chat");
  const progressBox = document.querySelector("#ki-fortschritt");
  const progressPhase = document.querySelector("#ki-fortschritt-phase");
  const progressTime = document.querySelector("#ki-fortschritt-zeit");
  const progressDetail = document.querySelector("#ki-fortschritt-detail");


  if (!form || !input || !output) return;
  input.maxLength = maxQuestionChars;

  let messages = [];
  let loading = false;
  let chatGeneration = 0;
  let requestController = null;
  let contextWasShortened = false;

  // Der Server meldet derzeit keine Zwischenschritte oder Prozentwerte.
  // Daher zeigen wir nur echte Frontend-Etappen und die vergangene Zeit.
  let progressTimer = null;
  let progressStart = 0;
  let currentPhase = "";

  // Echte Rueckmeldungen der Python-API werden ueber eine eigene
  // authentifizierte Edge-Function abgefragt. Ist sie noch nicht installiert,
  // bleibt der bestehende indeterminierte Fortschritt erhalten.
  let activeProgressId = null;
  let progressPollTimer = null;
  let progressPollBusy = false;
  let progressPollingDisabled = false;
  const serverPhases = Object.freeze({
    received: "Anfrage auf dem Mac Studio empfangen",
    planning: "Zutaten und Suchwuensche werden analysiert",
    embedding: "Suchvektor wird erstellt",
    searching: "Qdrant durchsucht die Rezeptdatenbank",
    filtering: "Gefundene Rezepte werden geprueft",
    found: "Rezeptsuche abgeschlossen",
    generating: "Ollama formuliert die Antwort",
    done: "Antwort fertiggestellt",
    error: "Die Verarbeitung auf dem Mac Studio ist fehlgeschlagen"
  });

  async function pollRealProgress(id, token) {
    if (!id || id !== activeProgressId || progressPollingDisabled || progressPollBusy) return;
    progressPollBusy = true;
    try {
      const response = await fetch(PROGRESS_URL + "?id=" + encodeURIComponent(id), {
        method: "GET",
        cache: "no-store",
        headers: {
          "apikey": KI_PUBLIC_KEY,
          "Authorization": "Bearer " + token
        }
      });
      if (!response.ok) throw new Error("Fortschrittsdienst nicht erreichbar");
      const data = await response.json();
      if (!data || typeof data.phase !== "string" || !serverPhases[data.phase]) return;
      if (id !== activeProgressId || !progressBox || progressBox.hidden) return;
      currentPhase = "server-" + data.phase;
      progressPhase.textContent = serverPhases[data.phase];
      const count = Number(data.recipe_count);
      progressDetail.textContent = Number.isInteger(count) && count >= 0 && count <= 100
        ? count + " Rezepte gefunden. " + (data.phase === "generating"
          ? "Ollama formuliert die Antwort."
          : "Die Anfrage wird weiterverarbeitet.")
        : "Bestätigter Verarbeitungsschritt vom Mac Studio. Die Gesamtdauer ist noch nicht vorhersagbar.";
      updateProgressTime();
    } catch (err) {
      // Ein nicht eingerichteter oder kurzzeitig ausgefallener Fortschrittskanal
      // darf die eigentliche Rezeptsuche niemals beeintraechtigen.
      progressPollingDisabled = true;
      if (id === activeProgressId && currentPhase.startsWith("server-") === false) {
        progressDetail.textContent = "Der Server sendet derzeit keine Detailmeldungen. Die Rezeptanfrage läuft unabhängig davon weiter.";
      }
    } finally {
      progressPollBusy = false;
    }
  }

  function startProgressPolling(id, token) {
    stopProgressPolling();
    activeProgressId = id;
    progressPollingDisabled = false;
    void pollRealProgress(id, token);
    progressPollTimer = setInterval(() => { void pollRealProgress(id, token); }, 1600);
  }

  function stopProgressPolling() {
    clearInterval(progressPollTimer);
    progressPollTimer = null;
    activeProgressId = null;
    progressPollBusy = false;
  }


  function updateProgressTime() {
    if (!progressBox || progressBox.hidden) return;
    const seconds = Math.max(0, Math.floor((Date.now() - progressStart) / 1000));
    progressTime.textContent = seconds + " s";
    if (currentPhase === "waiting") {
      progressDetail.textContent = seconds >= 30
        ? "Die Antwort dauert länger als gewöhnlich. Die Anfrage läuft noch; vom KI-Server werden keine einzelnen Arbeitsschritte übertragen."
        : seconds >= 12
          ? "Die Anfrage wurde gesendet. Wir warten auf die KI-Antwort; der genaue Fortschritt ist nicht messbar."
          : "Die Anfrage wurde gesendet. Der genaue Bearbeitungsstand auf dem KI-Server ist nicht verfügbar.";
    }
  }

  function progressStage(stage) {
    if (!progressBox) return;
    currentPhase = stage;
    const phases = {
      auth: "Anmeldung wird geprüft",
      waiting: "Anfrage gesendet – Antwort ausstehend",
      received: "Antwort empfangen",
      display: "Antwort wird angezeigt"
    };
    progressPhase.textContent = phases[stage] || "Anfrage läuft";
    if (stage !== "waiting") {
      progressDetail.textContent = {
        auth: "RezeptShare prüft die bestehende Anmeldung.",
        received: "Die Antwort ist eingetroffen und wird verarbeitet.",
        display: "Die Antwort wird im Chat dargestellt."
      }[stage] || "";
    }
    updateProgressTime();
  }

  function startProgress() {
    if (!progressBox) return;
    clearInterval(progressTimer);
    progressStart = Date.now();
    progressBox.hidden = false;
    progressStage("auth");
    progressTimer = setInterval(updateProgressTime, 1000);
  }

  function stopProgress() {
    clearInterval(progressTimer);
    progressTimer = null;
    if (progressBox) progressBox.hidden = true;
  }


  async function kiAnfrage(nachrichten, phaseChanged = null) {
    contextWasShortened = false;
    const question = nachrichten.at(-1);
    if (question?.role !== 'user' || typeof question.content !== 'string'
        || !question.content.trim() || question.content.length > maxQuestionChars) {
      throw new Error(`Bitte stelle eine Frage mit höchstens ${maxQuestionChars} Zeichen.`);
    }
    if (!KI_URL || !KI_PUBLIC_KEY) {
      throw new Error("Der KI-Assistent ist noch nicht eingerichtet.");
    }
    if (!supabaseClient) throw new Error("Bitte melde dich bei RezeptShare an.");
    const generation = chatGeneration;
    const { data, error } = await supabaseClient.auth.getSession();
    if (generation !== chatGeneration) throw new Error('Anfrage abgebrochen.');
    if (error || !data.session) {
      throw new Error("Bitte melde dich erneut bei RezeptShare an.");
    }
    requestController = new AbortController();
    const signal = requestController.signal;
    // Statuskanal einmal pruefen, bevor die optionale Kennung gesendet wird.
    // Ohne installierten Rueckkanal bleibt die bisherige KI-Anfrage unveraendert.
    const candidateId = PROGRESS_URL && phaseChanged ? window.rezeptUuid.v4() : null;
    let progressId = null;
    if (candidateId) {
      try {
        const check = await fetch(PROGRESS_URL + "?id=" + encodeURIComponent(candidateId), {
          method: "GET",
          cache: "no-store",
          headers: {
            "apikey": KI_PUBLIC_KEY,
            "Authorization": "Bearer " + data.session.access_token
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(2000)])
        });
        if (check.ok && (await check.json())?.phase === "waiting") progressId = candidateId;
      } catch (_) { /* Der Statusdienst ist optional. */ }
    }
    // Nur vollständige Gesprächspaare entfernen; Rezepttexte nie abschneiden.
    let history = nachrichten.slice(0, -1);
    if (history.some(message => typeof message.content !== 'string'
        || message.content.length > MAX_MESSAGE_CHARS)) {
      history = [];
      contextWasShortened = true;
    }
    const statusId = progressId ? "\n[REZEPT_PROGRESS_ID:" + progressId + "]" : "";
    const requestMessages = [...history, { ...question, content: question.content + formatSuffix + statusId }];
    const bodySize = () => new TextEncoder().encode(JSON.stringify({ messages: requestMessages })).byteLength;
    while (requestMessages.length > 12 || bodySize() > MAX_BODY_BYTES) {
      if (requestMessages.length <= 1) throw new Error('Die Frage ist zu groß. Bitte kürze sie.');
      requestMessages.splice(0, Math.min(2, requestMessages.length - 1));
      contextWasShortened = true;
    }
    if (generation !== chatGeneration) throw new Error('Anfrage abgebrochen.');
    phaseChanged?.("waiting");
    if (progressId) startProgressPolling(progressId, data.session.access_token);
    const response = await fetch(KI_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "apikey": KI_PUBLIC_KEY,
        "Authorization": `Bearer ${data.session.access_token}`
      },
      body: JSON.stringify({ messages: requestMessages })
    });
    phaseChanged?.("received");
    const result = await response.json();
    if (generation !== chatGeneration) throw new Error('Anfrage abgebrochen.');
    if (!response.ok) throw new Error(result.message || result.error || `HTTP ${response.status}`);
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
    status.textContent = "";
    startProgress();
    const generation = chatGeneration;

    try {
      const nextMessages = [
        ...messages,
        { role: "user", content: question }
      ].slice(-11);

      const answer = await kiAnfrage(nextMessages, progressStage);
      progressStage("display");

      // Erst nach Erfolg den Chatverlauf ergänzen.
      output.querySelector(".ki-begruessung")?.remove();
      showMessage("user", question);
      const germanAnswer = window.RezeptShareKIV2?.localizeAnswer(answer) || answer;
      showMessage("assistant", germanAnswer);

      messages = germanAnswer.length > MAX_MESSAGE_CHARS ? [] : [
        ...nextMessages,
        { role: "assistant", content: germanAnswer }
      ].slice(-10);

      input.value = "";
      status.textContent = germanAnswer.length > MAX_MESSAGE_CHARS
        ? 'Die Antwort ist sehr lang. Deine nächste Frage beginnt einen neuen Gesprächsabschnitt; die Antwort bleibt hier sichtbar.'
        : contextWasShortened ? 'Für diese Frage wurde nur der neuere Gesprächsverlauf verwendet. Frühere Antworten bleiben hier sichtbar.' : '';

    } catch (err) {
      if (generation !== chatGeneration) return;
      console.error("KI-Fehler:", err);
      status.textContent =
        err.message || "Die KI-Anfrage ist fehlgeschlagen.";
    } finally {
      if (generation === chatGeneration) {
        stopProgressPolling();
        stopProgress();
        setLoading(false);
      }
    }
  });

  newButton.addEventListener("click", () => {
    if (loading) return;

    stopProgressPolling();
    stopProgress();
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
  window.rezeptAssistentZuruecksetzen = () => {
    chatGeneration++;
    requestController?.abort();
    requestController = null;
    stopProgressPolling(); stopProgress(); setLoading(false);
    messages = []; output.replaceChildren(); input.value = ''; status.textContent = '';
    const greeting = document.createElement('p'); greeting.className = 'ki-begruessung';
    greeting.textContent = 'Hallo! Frage mich nach Rezepten, Zutaten oder Kochideen.';
    output.append(greeting);
  };
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
