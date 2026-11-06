
function captchaInitialisieren() {
    anmeldeCaptchaId = hcaptcha.render(
        document.querySelector("#anmelde-formular .h-captcha")
    );

    registrierCaptchaId = hcaptcha.render(
        document.querySelector("#registrier-formular .h-captcha")
    );
}

// Damit die hCaptcha-API die Funktion aufrufen kann
window.captchaInitialisieren = captchaInitialisieren;


const landingBereich = document.querySelector("#landing-bereich");
const appBereich = document.querySelector("#app-bereich");
const hauptnavigation = document.querySelector("#hauptnavigation");
const navigationsButtons = document.querySelectorAll(".nav-button");
const appAnsichten = document.querySelectorAll(".app-ansicht");
const gruppenKontext = document.querySelector("#gruppen-kontext");
const benutzerMenue = document.querySelector("#benutzer-menue");
const profilButton = document.querySelector("#profil-button");
const profilAuswahl = document.querySelector("#profil-auswahl");
const abmeldenButton = document.querySelector("#abmelden-button");
const benutzerName = document.querySelector("#benutzer-name");
const benutzerEmail = document.querySelector("#benutzer-email");

const anmeldeFormular = document.querySelector("#anmelde-formular");
const registrierFormular = document.querySelector("#registrier-formular");
let anmeldeCaptchaId;
let registrierCaptchaId;
const authMeldung = document.querySelector("#auth-meldung");
const einladungsHinweis = document.querySelector("#einladungs-hinweis");
const profilDialog = document.querySelector("#profil-dialog");
const profilFormular = document.querySelector("#profil-formular");
const profilMeldung = document.querySelector("#profil-meldung");

const gruppenAuswahl = document.querySelector("#gruppen-auswahl");
const gruppenListe = document.querySelector("#gruppen-liste");
const gruppenMeldung = document.querySelector("#gruppen-meldung");
const neueGruppeButton = document.querySelector("#neue-gruppe-button");
const gruppenFormular = document.querySelector("#gruppen-formular");
const gruppeErstellenAbbrechen = document.querySelector("#gruppe-erstellen-abbrechen");

const rezeptFormular = document.querySelector("#rezept-formular");
const rezeptNameEingabe = document.querySelector("#rezept-name");
const rezeptTextEingabe = document.querySelector("#rezept-text");
const rezeptBildEingabe = document.querySelector("#rezept-bild");
const bildHinweis = document.querySelector("#bild-hinweis");
const kalorienEingabe = document.querySelector("#kalorien");
const proteinEingabe = document.querySelector("#protein");
const kohlenhydrateEingabe = document.querySelector("#kohlenhydrate");
const fettEingabe = document.querySelector("#fett");
const rezeptMeldung = document.querySelector("#rezept-meldung");
const rezeptListe = document.querySelector("#rezept-liste");
const rezeptAnzahl = document.querySelector("#rezept-anzahl");
const rezeptSuche = document.querySelector("#rezept-suche");
const sortierButton = document.querySelector("#sortier-button");
const sortierMenue = document.querySelector("#sortier-menue");
const sortierRichtungButton = document.querySelector("#sortier-richtung");
const sortierOptionen = [
    ["aktuell", "Zuletzt geändert"], ["name", "Name"],
    ["protein", "Protein"], ["kalorien", "Kalorien"],
    ["kohlenhydrate", "Kohlenhydrate"], ["fett", "Fett"]
];
let rezeptSortierung = "aktuell-ab";
try {
    const gespeichert = localStorage.getItem("rezeptSortierung");
    if (sortierOptionen.some(([wert]) => [wert + "-auf", wert + "-ab"].includes(gespeichert))) rezeptSortierung = gespeichert;
} catch { /* Sortierung funktioniert auch ohne verfügbaren Browserspeicher. */ }
function sortierungSpeichern() {
    try { localStorage.setItem("rezeptSortierung", rezeptSortierung); } catch { /* Auswahl bleibt für diese Sitzung aktiv. */ }
}
const namensVergleich = new Intl.Collator("de", { sensitivity: "accent", numeric: true });

function rezepteSortieren(liste) {
    const [feld, richtung] = rezeptSortierung.split("-");
    if (feld === "aktuell") return richtung === "ab" ? liste : liste.slice().reverse();
    const faktor = richtung === "auf" ? 1 : -1;
    return liste.slice().sort((a, b) => {
        const name = namensVergleich.compare(a.name, b.name);
        const id = String(a.id).localeCompare(String(b.id));
        if (feld === "name") return name * faktor || id;
        const links = a.naehrwerte[feld], rechts = b.naehrwerte[feld];
        if (links == null && rechts != null) return 1;
        if (rechts == null && links != null) return -1;
        return ((links ?? 0) - (rechts ?? 0)) * faktor || name || id;
    });
}

function sortierMenueSchliessen(fokus = false) {
    sortierMenue.hidden = true;
    sortierButton.setAttribute("aria-expanded", "false");
    if (fokus) sortierButton.focus();
}

function sortierAnzeigeAktualisieren() {
    const [feld, richtung] = rezeptSortierung.split("-");
    for (const button of sortierMenue.children) {
        button.setAttribute("aria-checked", String(button.dataset.wert === feld));
    }
    sortierButton.title = "Sortierung: " + sortierOptionen.find(([wert]) => wert === feld)[1];
    const absteigend = richtung === "ab";
    const beschreibung = feld === "name" ? (absteigend ? "Z–A" : "A–Z")
        : feld === "aktuell" ? (absteigend ? "Neueste zuerst" : "Älteste zuerst")
        : absteigend ? "Am meisten zuerst" : "Am wenigsten zuerst";
    sortierRichtungButton.classList.toggle("nach-oben", absteigend);
    sortierRichtungButton.title = beschreibung + " – Richtung wechseln";
    sortierRichtungButton.setAttribute("aria-label", sortierRichtungButton.title);
}
sortierRichtungButton.addEventListener("click", () => {
    const [feld, richtung] = rezeptSortierung.split("-");
    rezeptSortierung = feld + (richtung === "auf" ? "-ab" : "-auf");
    sortierungSpeichern();
    sortierAnzeigeAktualisieren();
    rezeptListeAnzeigen();
    sortierMenueSchliessen();
});

for (const [wert, text] of sortierOptionen) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.dataset.wert = wert;
    button.setAttribute("role", "menuitemradio");
    button.tabIndex = -1;
    button.addEventListener("click", () => {
        rezeptSortierung = wert + "-" + rezeptSortierung.split("-")[1];
        sortierungSpeichern();
        sortierAnzeigeAktualisieren();
        rezeptListeAnzeigen();
        sortierMenueSchliessen(true);
    });
    sortierMenue.append(button);
}
sortierAnzeigeAktualisieren();
function sortierMenueOeffnen() {
    sortierMenue.hidden = false;
    sortierButton.setAttribute("aria-expanded", "true");
    sortierMenue.querySelector('[aria-checked="true"]').focus();
}
sortierButton.addEventListener("click", () => {
    if (sortierMenue.hidden) sortierMenueOeffnen();
    else sortierMenueSchliessen();
});
sortierButton.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        sortierMenueOeffnen();
    }
});
sortierMenue.addEventListener("keydown", event => {
    const buttons = [...sortierMenue.children];
    const index = buttons.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
    }
    if (event.key === "Escape") { event.preventDefault(); sortierMenueSchliessen(true); }
    if (event.key === "Tab") sortierMenueSchliessen(true);
});
document.addEventListener("click", event => {
    if (!event.target.closest(".sortierung")) sortierMenueSchliessen();
});

const formularUeberschrift = document.querySelector("#formular-ueberschrift");
const speichernButton = document.querySelector("#speichern-button");
const abbrechenButton = document.querySelector("#abbrechen-button");

const rezeptDetailDialog = document.querySelector("#rezept-detail-dialog");
const rezeptDetailInhalt = document.querySelector("#rezept-detail-inhalt");
const rezeptDetailSchliessen = document.querySelector("#rezept-detail-schliessen");
const rezeptBearbeitenButton = document.querySelector("#rezept-bearbeiten-button");
const rezeptLoeschenButton = document.querySelector("#rezept-loeschen-button");
const bestaetigungsDialog = document.querySelector("#bestaetigungs-dialog");
const bestaetigungsTitel = document.querySelector("#bestaetigungs-titel");
const bestaetigungsText = document.querySelector("#bestaetigungs-text");
const bestaetigungAbbrechen = document.querySelector("#bestaetigung-abbrechen");
const bestaetigungOk = document.querySelector("#bestaetigung-ok");

const BILD_SPEICHER = "rezeptbilder";
const MAXIMALE_BILDGROESSE = 5 * 1024 * 1024;
const ERLAUBTE_BILDTYPEN = ["image/jpeg", "image/png", "image/webp"];

let supabaseClient = null;
let aktiverBenutzer = null;
let gruppen = [];
let aktiveGruppenId = null;
let alleGruppenAnzeigen = false;
let rezeptLadeNummer = 0;
let rezepte = [];
let bearbeitetesRezeptId = null;
let bearbeiteteVersion = null;
let ausgewaehltesRezept = null;
let vorhandenerBildPfad = null;
let aktiveAnsicht = "rezepte";
let formularGeaendert = false;
let bestaetigungAufloesen = null;
function supabaseVerbinden() {
    const konfiguration = window.REZEPT_SHARE_KONFIGURATION;
    const urlFehlt = !konfiguration?.supabaseUrl || konfiguration.supabaseUrl.includes("DEINE_");
    const schluesselFehlt = !konfiguration?.supabasePublishableKey
        || konfiguration.supabasePublishableKey.includes("DEIN_");

    if (urlFehlt || schluesselFehlt) {
        throw new Error("Bitte trage zuerst deine Supabase-URL und den Publishable Key in konfiguration.js ein.");
    }
    if (!window.supabase?.createClient) {
        throw new Error("Die Supabase-Bibliothek konnte nicht geladen werden.");
    }

    // In Supabase wird manchmal versehentlich der REST-Endpunkt kopiert.
    // Der Client benötigt stattdessen nur die Projekt-Basisadresse.
    const projektAdresse = new URL(konfiguration.supabaseUrl);
    if (projektAdresse.pathname.replace(/\/$/, "") === "/rest/v1") {
        projektAdresse.pathname = "/";
    }

    return window.supabase.createClient(
        projektAdresse.toString(),
        konfiguration.supabasePublishableKey,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
}

function fehlerText(fehler, standardText = "Die Anfrage ist fehlgeschlagen.") {
    if (!fehler) return standardText;
    const bekannteMeldungen = {
        "Invalid login credentials": "E-Mail-Adresse oder Passwort ist falsch.",
        "User already registered": "Für diese E-Mail-Adresse gibt es bereits ein Konto.",
        "Email rate limit exceeded": "Es wurden zu viele E-Mails angefordert. Bitte versuche es später erneut."
    };
    return bekannteMeldungen[fehler.message] || fehler.message || standardText;
}

function datenAusErgebnis(ergebnis, standardText) {
    if (!ergebnis) {
        throw new Error(
            "Die Supabase-Anfrage hat kein Ergebnis zurückgegeben."
        );
    }

    if (ergebnis.error) {
        throw new Error(fehlerText(ergebnis.error, standardText));
    }

    return ergebnis.data;
}

function elementErstellen(tag, klasse, text) {
    const element = document.createElement(tag);
    if (klasse) element.className = klasse;
    if (text !== undefined) element.textContent = text;
    return element;
}

function optionaleZahlAuslesen(eingabeFeld) {
    if (eingabeFeld.value === "") return null;
    const zahl = Number(eingabeFeld.value);
    if (!Number.isFinite(zahl) || zahl < 0) {
        throw new Error("Nährwerte müssen positive Zahlen sein.");
    }
    return zahl;
}

function bestaetigungFragen(titel, text, buttonText = "Bestätigen", gefahr = false) {
    bestaetigungsTitel.textContent = titel;
    bestaetigungsText.textContent = text;
    bestaetigungOk.textContent = buttonText;
    bestaetigungOk.classList.toggle("gefahr-button", gefahr);
    bestaetigungsDialog.showModal();
    return new Promise(function (resolve) { bestaetigungAufloesen = resolve; });
}

function bestaetigungBeenden(ergebnis) {
    bestaetigungsDialog.close();
    if (bestaetigungAufloesen) {
        bestaetigungAufloesen(ergebnis);
        bestaetigungAufloesen = null;
    }
}

function anmeldeAnsichtAnzeigen() {
    landingBereich.hidden = false;
    appBereich.hidden = true;
    hauptnavigation.hidden = true;
    benutzerMenue.hidden = true;
    profilAuswahl.hidden = true;
}

function appAnsichtAnzeigen() {
    landingBereich.hidden = true;
    appBereich.hidden = false;
    hauptnavigation.hidden = false;
    benutzerMenue.hidden = false;
    benutzerName.textContent = aktiverBenutzer.anzeigename;
    benutzerEmail.textContent = aktiverBenutzer.email;
    ansichtAnzeigen("rezepte");
}

const handyAnsicht = window.matchMedia("(max-width: 600px)");
function gruppenAuswahlPositionieren() {
    if (handyAnsicht.matches) {
        document.querySelector("#rezepte-ansicht .ansicht-titel").append(rezeptAnzahl);
    } else {
        document.querySelector("#rezept-statistik").prepend(rezeptAnzahl);
    }
    if (aktiveAnsicht === "hinzufuegen") {
        speichernButton.after(gruppenKontext);
    } else if (aktiveAnsicht === "rezepte" && !handyAnsicht.matches) {
        document.querySelector("#rezepte-ansicht .ansicht-titel").after(gruppenKontext);
    } else {
        appBereich.prepend(gruppenKontext);
    }
}
handyAnsicht.addEventListener("change", gruppenAuswahlPositionieren);

function ansichtAnzeigen(ansichtName) {
    if (ansichtName === "hinzufuegen" && alleGruppenAnzeigen && !darfRezepteBearbeiten()) {
        aktiveGruppenId = gruppen.find(g => darfRezepteBearbeiten(g.id))?.id || aktiveGruppenId;
    }
    if (ansichtName === "hinzufuegen" && !darfRezepteBearbeiten()) ansichtName = "rezepte";
    aktiveAnsicht = ansichtName;
    gruppenAuswahlAktualisieren();
    document.querySelector('[data-ansicht="hinzufuegen"]').hidden = !darfRezeptHinzufuegen();
    appAnsichten.forEach(function (ansicht) {
        ansicht.hidden = ansicht.id !== ansichtName + "-ansicht";
    });
    gruppenKontext.hidden = ansichtName === "gruppen";
    gruppenAuswahlPositionieren();
    navigationsButtons.forEach(function (button) {
        const istAktiv = button.dataset.ansicht === ansichtName;
        button.classList.toggle("aktiv", istAktiv);
        if (istAktiv) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
}

async function ansichtSicherWechseln(ansichtName) {
    if (aktiveAnsicht === "hinzufuegen" && formularGeaendert && ansichtName !== "hinzufuegen") {
        const verwerfen = await bestaetigungFragen(
            "Änderungen verwerfen?",
            "Deine noch nicht gespeicherten Eingaben gehen verloren.",
            "Verwerfen",
            true
        );
        if (!verwerfen) return false;
        formularZuruecksetzen();
    }
    ansichtAnzeigen(ansichtName);
    return true;
}

async function benutzerAusSitzungLaden(sitzungsBenutzer) {
    const profil = datenAusErgebnis(
        await supabaseClient.from("profile").select("id, anzeigename, bild_pfad, profilbild_festgelegt, wird_geloescht").eq("id", sitzungsBenutzer.id).single(),
        "Das Profil konnte nicht geladen werden."
    );
    return { id: sitzungsBenutzer.id, email: sitzungsBenutzer.email, anzeigename: profil.anzeigename, bildPfad: profil.bild_pfad, profilbildFestgelegt: profil.profilbild_festgelegt, wirdGeloescht: profil.wird_geloescht };
}

async function angemeldeteAppLaden() {
    await kopfProfilbildLaden();
    if (!aktiverBenutzer.profilbildFestgelegt || aktiverBenutzer.wirdGeloescht) {
        landingBereich.hidden = true;
        await profilOeffnen(!aktiverBenutzer.profilbildFestgelegt);
        return;
    }
    appAnsichtAnzeigen();
    const neueGruppenId = await einladungAnnehmenWennVorhanden();
    await gruppenLaden(neueGruppenId);
}

async function sitzungLaden() {
    const daten = datenAusErgebnis(
        await supabaseClient.auth.getSession(),
        "Die Anmeldung konnte nicht geprüft werden."
    );
    if (!daten.session?.user) {
        anmeldeAnsichtAnzeigen();
        return;
    }
    aktiverBenutzer = await benutzerAusSitzungLaden(daten.session.user);
    await angemeldeteAppLaden();
}

function gruppeFuerBrowser(daten) {
    return {
        id: Number(daten.id),
        name: daten.name,
        istPersoenlich: daten.ist_persoenlich,
        rolle: daten.rolle,
        neueNurAnsehen: daten.neue_nur_ansehen,
        mitgliederAnzahl: Number(daten.mitglieder_anzahl),
        rezepteAnzahl: Number(daten.rezepte_anzahl)
    };
}

function gruppenAuswahlAktualisieren() {
    gruppenAuswahl.replaceChildren();
    if (aktiveAnsicht === "rezepte") {
        const alle = elementErstellen("option", null, "Alle");
        alle.value = "alle";
        gruppenAuswahl.append(alle);
    }
    gruppen.forEach(function (gruppe) {
        const option = elementErstellen("option", null, gruppe.name);
        option.value = gruppe.id;
        option.disabled = aktiveAnsicht === "hinzufuegen" && !darfRezepteBearbeiten(gruppe.id);
        gruppenAuswahl.append(option);
    });
    gruppenAuswahl.value = aktiveAnsicht === "rezepte" && alleGruppenAnzeigen ? "alle" : (aktiveGruppenId ?? "");
}

async function gruppenLaden(bevorzugteGruppenId = null) {
    const daten = datenAusErgebnis(
        await supabaseClient.rpc("gruppen_auflisten"),
        "Die Gruppen konnten nicht geladen werden."
    );
    gruppen = daten.map(gruppeFuerBrowser);
    const bevorzugteId = Number(bevorzugteGruppenId);
    const bevorzugteGruppe = gruppen.find(function (gruppe) { return gruppe.id === bevorzugteId; });
    const letzteId = Number(localStorage.getItem("aktiveGruppenId"));
    const letzteGruppe = gruppen.find(function (gruppe) { return gruppe.id === letzteId; });
    aktiveGruppenId = bevorzugteGruppe?.id || letzteGruppe?.id || gruppen[0]?.id || null;
    gruppenAuswahlAktualisieren();
    if (aktiveGruppenId) localStorage.setItem("aktiveGruppenId", aktiveGruppenId);
    gruppenListeAnzeigen();
    formularZuruecksetzen();
    await rezepteLaden();
}

function verknuepftesObjekt(wert) {
    return Array.isArray(wert) ? wert[0] : wert;
}

async function bildUrlErstellen(bildPfad) {
    if (!bildPfad) return null;
    const ergebnis = await supabaseClient.storage.from(BILD_SPEICHER).createSignedUrl(bildPfad, 60 * 60);
    if (ergebnis.error) {
        console.warn("Ein Rezeptbild konnte nicht geladen werden:", ergebnis.error.message);
        return null;
    }
    return ergebnis.data.signedUrl;
}

async function rezeptFuerBrowser(daten) {
    const ersteller = verknuepftesObjekt(daten.ersteller);
    return {
        id: Number(daten.id),
        version: daten.version,
        gruppenId: Number(daten.gruppen_id),
        name: daten.name,
        text: daten.text,
        bildPfad: daten.bild_pfad,
        bild: await bildUrlErstellen(daten.bild_pfad),
        ersteller: {
            id: ersteller?.id || daten.erstellt_von,
            anzeigename: ersteller?.anzeigename || "Gelöschtes Konto"
        },
        naehrwerte: {
            kalorien: daten.kalorien,
            protein: daten.protein,
            kohlenhydrate: daten.kohlenhydrate,
            fett: daten.fett
        }
    };
}

async function rezepteLaden() {
    const ladenummer = ++rezeptLadeNummer;
    let geladen = [];
    if (aktiveGruppenId || alleGruppenAnzeigen) {
        let query = supabaseClient.from("rezepte")
            .select("id, gruppen_id, erstellt_von, name, text, bild_pfad, kalorien, protein, kohlenhydrate, fett, version, aktualisiert_am, ersteller:profile!rezepte_erstellt_von_fkey(id, anzeigename)");
        // RLS beschränkt auch die Gesamtliste auf die Gruppen des Kontos.
        if (!alleGruppenAnzeigen) query = query.eq("gruppen_id", aktiveGruppenId);
        const daten = await alleZeilenLaden(query.order("aktualisiert_am", { ascending: false }).order("id", { ascending: false }));
        geladen = await Promise.all(daten.map(rezeptFuerBrowser));
    }
    if (ladenummer !== rezeptLadeNummer) return;
    rezepte = geladen;
    rechteAnzeigen();
    rezeptListeAnzeigen();
}

function rezeptKarteErstellen(rezept) {
    const gruppe = gruppen.find(g => g.id === rezept.gruppenId);
    const karte = elementErstellen("button", "rezept-karte");
    karte.type = "button";
    karte.setAttribute("aria-label", rezept.name + " öffnen");

    const bildBereich = elementErstellen("div", "rezept-kartenbild");
    bildBereich.setAttribute("aria-hidden", "true");
    if (rezept.bild) {
        karte.classList.add("mit-bild");
        const bild = document.createElement("img");
        bild.src = rezept.bild;
        bild.alt = "";
        bildBereich.append(bild);
    } else {
        bildBereich.classList.add("rezept-bildplatzhalter");
        bildBereich.innerHTML = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h30v44H18a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z"/><path d="M20 10v44M12 44h8M28 37h12M28 44h9M29 29v-5a5 5 0 0 1 1-10 5 5 0 0 1 9 0 5 5 0 0 1 1 10v5Z"/></svg>';
    }
    karte.append(bildBereich);

    const inhalt = elementErstellen("div", "rezept-karte-inhalt");
    inhalt.append(elementErstellen("h3", null, rezept.name));
    const meta = elementErstellen("p", "rezept-ersteller");
    if (alleGruppenAnzeigen && gruppe) meta.append(elementErstellen("span", null, gruppe.name));
    if (!gruppe?.istPersoenlich) {
        if (meta.childNodes.length) {
            const trenner = elementErstellen("span", "rezept-meta-trenner gruppen-statistik-trenner", " | ");
            trenner.setAttribute("aria-hidden", "true");
            meta.append(trenner);
        }
        meta.append(elementErstellen("span", null, "Hinzugefügt von " + rezept.ersteller.anzeigename));
    }
    if (meta.childNodes.length) inhalt.append(meta);
    karte.append(inhalt);
    karte.addEventListener("click", function () { rezeptDetailsAnzeigen(rezept); });
    return karte;
}

function rezeptListeAnzeigen() {
    rezeptListe.replaceChildren();
    const suchtext = rezeptSuche.value.trim().toLowerCase();
    const sichtbareRezepte = rezepte.filter(function (rezept) {
        return rezept.name.toLowerCase().includes(suchtext);
    });
    rezeptAnzahl.textContent = sichtbareRezepte.length === 1 ? "1 Rezept" : sichtbareRezepte.length + " Rezepte";
    const mitgliederBadge = document.querySelector("#aktive-mitglieder-anzahl");
    const aktiveGruppe = gruppen.find(gruppe => gruppe.id === aktiveGruppenId);
    mitgliederBadge.hidden = alleGruppenAnzeigen || !aktiveGruppe;
    if (aktiveGruppe) {
        const anzahl = aktiveGruppe.mitgliederAnzahl;
        mitgliederBadge.textContent = anzahl === 1 ? "1 Mitglied" : anzahl + " Mitglieder";
    }
    if (sichtbareRezepte.length === 0) {
        const meldung = suchtext ? "Kein Rezept mit diesem Namen gefunden."
            : alleGruppenAnzeigen ? "In deinen Gruppen gibt es noch keine Rezepte." : "In dieser Gruppe gibt es noch keine Rezepte.";
        rezeptListe.append(elementErstellen("p", "leerer-hinweis", meldung));
        return;
    }
    rezepteSortieren(sichtbareRezepte).forEach(function (rezept) { rezeptListe.append(rezeptKarteErstellen(rezept)); });
}

function naehrwertListeErstellen(rezept) {
    const werte = [
        ["Kalorien", rezept.naehrwerte.kalorien, "kcal"],
        ["Protein", rezept.naehrwerte.protein, "g"],
        ["Kohlenhydrate", rezept.naehrwerte.kohlenhydrate, "g"],
        ["Fett", rezept.naehrwerte.fett, "g"]
    ].filter(function (wert) { return wert[1] != null; });
    if (werte.length === 0) return null;
    const liste = elementErstellen("ul", "naehrwert-liste");
    werte.forEach(function (wert) {
        liste.append(elementErstellen("li", null, wert[0] + ": " + wert[1] + " " + wert[2]));
    });
    return liste;
}

let kopierMeldungTimer;
let kopierVorgang = 0;
function rezeptKopierInhalt(rezept) {
    const container = document.createElement("div");
    container.append(elementErstellen("h1", null, rezept.name));
    const text = document.createElement("p");
    rezept.text.split(/\r?\n/).forEach((zeile, index) => {
        if (index) text.append(document.createElement("br"));
        text.append(document.createTextNode(zeile));
    });
    container.append(text);
    const liste = naehrwertListeErstellen(rezept);
    let klartext = rezept.name + "\n\n" + rezept.text;
    if (liste) {
        container.append(elementErstellen("h2", null, "Nährwerte"), liste);
        klartext += "\n\nNährwerte\n" + [...liste.children].map(li => li.textContent).join("\n");
    }
    return { html: container.innerHTML, text: klartext };
}

async function rezeptKopieren() {
    if (!ausgewaehltesRezept) return;
    const inhalt = rezeptKopierInhalt(ausgewaehltesRezept);
    const vorgang = ++kopierVorgang;
    const button = document.querySelector("#rezept-kopieren-button");
    const meldung = document.querySelector("#kopier-meldung");
    clearTimeout(kopierMeldungTimer);
    meldung.hidden = true;
    button.disabled = true;
    try {
        let kopiert = false;
        if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
            try {
                await navigator.clipboard.write([new ClipboardItem({
                    "text/html": new Blob([inhalt.html], { type: "text/html" }),
                    "text/plain": new Blob([inhalt.text], { type: "text/plain" })
                })]);
                kopiert = true;
            } catch { /* Ohne HTML-Unterstützung Klartext versuchen. */ }
        }
        if (!kopiert) {
            if (!navigator.clipboard?.writeText) throw new Error("Zwischenablage nicht verfügbar");
            await navigator.clipboard.writeText(inhalt.text);
        }
        if (vorgang !== kopierVorgang) return;
        meldung.className = "erfolgsmeldung";
        meldung.textContent = "Rezept kopiert";
        meldung.hidden = false;
        kopierMeldungTimer = setTimeout(() => { meldung.hidden = true; }, 3000);
    } catch {
        if (vorgang !== kopierVorgang) return;
        meldung.className = "fehlermeldung";
        meldung.textContent = "Kopieren nicht möglich. Bitte erlaube den Zugriff auf die Zwischenablage und versuche es erneut.";
        meldung.hidden = false;
    } finally {
        if (vorgang === kopierVorgang) button.disabled = false;
    }
}
document.querySelector("#rezept-kopieren-button").addEventListener("click", rezeptKopieren);

function naehrwertBoxenErstellen(rezept) {
    const felder = [["kalorien", "Kalorien", "kcal"], ["protein", "Protein", "g"],
        ["kohlenhydrate", "Kohlenhydrate", "g"], ["fett", "Fett", "g"]];
    if (felder.every(([feld]) => rezept.naehrwerte[feld] == null)) return null;
    const liste = elementErstellen("dl", "rezept-naehrwertboxen");
    liste.setAttribute("aria-label", "Nährwerte");
    for (const [feld, name, einheit] of felder) {
        const box = elementErstellen("div", "rezept-naehrwertbox");
        const wert = rezept.naehrwerte[feld];
        const zahl = elementErstellen("dd", "rezept-naehrwertzahl", wert == null ? "—" : String(wert));
        if (wert != null) zahl.append(elementErstellen("span", "rezept-naehrwerteinheit", " " + einheit));
        box.append(elementErstellen("dt", null, name), zahl);
        liste.append(box);
    }
    return liste;
}

async function rezeptDetailsAnzeigen(rezept) {
    ++kopierVorgang;
    clearTimeout(kopierMeldungTimer);
    document.querySelector("#kopier-meldung").hidden = true;
    document.querySelector("#rezept-kopieren-button").disabled = false;
    ausgewaehltesRezept = rezept;
    rezeptDetailInhalt.replaceChildren();
    const auftakt = elementErstellen("div", "rezept-auftakt");
    auftakt.classList.toggle("mit-foto", Boolean(rezept.bild));
    const kopf = elementErstellen("header", "rezept-detail-kopf");
    const titel = elementErstellen("h2", "rezept-detail-titel", rezept.name);
    titel.id = "rezept-detail-titel";
    rezeptDetailDialog.setAttribute("aria-labelledby", titel.id);
    kopf.append(titel);
    const gruppe = gruppen.find(g => g.id === rezept.gruppenId);
    if (!gruppe?.istPersoenlich) {
        kopf.append(elementErstellen("p", "rezept-ersteller", "Hinzugefügt von " + rezept.ersteller.anzeigename));
    }
    auftakt.append(kopf);
    if (rezept.bild) {
        const foto = elementErstellen("div", "rezept-detail-foto");
        const bild = document.createElement("img");
        bild.className = "rezept-detail-bild";
        bild.src = rezept.bild;
        bild.alt = "Foto von " + rezept.name;
        foto.append(bild);
        auftakt.append(foto);
    }
    const naehrwerte = naehrwertBoxenErstellen(rezept);
    if (naehrwerte) auftakt.append(naehrwerte);
    rezeptDetailInhalt.append(auftakt);
    const textBereich = elementErstellen("section", "rezept-anleitung");
    textBereich.append(elementErstellen("h3", "rezept-abschnitt-titel", "Zutaten und Zubereitung"));
    textBereich.append(elementErstellen("p", "rezept-text", rezept.text));
    rezeptDetailInhalt.append(textBereich);
    rezeptBearbeitenButton.hidden = !darfRezepteBearbeiten(rezept.gruppenId);
    rezeptLoeschenButton.hidden = !darfRezeptLoeschen(rezept);
    if (!rezeptDetailDialog.open) rezeptDetailDialog.showModal();
    await aenderungenAnzeigen(rezept);
}

function formularZuruecksetzen() {
    rezeptFormular.reset();
    bearbeitetesRezeptId = null;
    bearbeiteteVersion = null;
    vorhandenerBildPfad = null;
    formularGeaendert = false;
    formularUeberschrift.textContent = "Rezept hinzufügen";
    speichernButton.textContent = "Rezept hinzufügen";
    abbrechenButton.hidden = true;
    bildHinweis.textContent = "JPEG, PNG oder WebP, maximal 5 MB";
    rezeptMeldung.textContent = "";
}

function rezeptBearbeiten(rezept) {
    if (!darfRezepteBearbeiten(rezept.gruppenId)) return;
    aktiveGruppenId = rezept.gruppenId;
    localStorage.setItem("aktiveGruppenId", aktiveGruppenId);
    bearbeitetesRezeptId = rezept.id;
    bearbeiteteVersion = rezept.version;
    vorhandenerBildPfad = rezept.bildPfad;
    rezeptNameEingabe.value = rezept.name;
    rezeptTextEingabe.value = rezept.text;
    kalorienEingabe.value = rezept.naehrwerte.kalorien ?? "";
    proteinEingabe.value = rezept.naehrwerte.protein ?? "";
    kohlenhydrateEingabe.value = rezept.naehrwerte.kohlenhydrate ?? "";
    fettEingabe.value = rezept.naehrwerte.fett ?? "";
    formularUeberschrift.textContent = "Rezept bearbeiten";
    speichernButton.textContent = "Änderungen speichern";
    abbrechenButton.hidden = false;
    bildHinweis.textContent = vorhandenerBildPfad
        ? "Das vorhandene Foto bleibt erhalten, solange du kein neues auswählst."
        : "JPEG, PNG oder WebP, maximal 5 MB";
    formularGeaendert = false;
    ansichtAnzeigen("hinzufuegen");
    rezeptNameEingabe.focus();
}

function rezeptDatenAusFormular() {
    const name = rezeptNameEingabe.value.trim();
    const text = rezeptTextEingabe.value.trim();
    if (!name || !text) throw new Error("Bitte fülle den Rezeptnamen und den Rezepttext aus.");
    if (name.length > 120 || text.length > 20000) {
        throw new Error("Der Rezeptname oder Rezepttext ist zu lang.");
    }
    return {
        name: name,
        text: text,
        kalorien: optionaleZahlAuslesen(kalorienEingabe),
        protein: optionaleZahlAuslesen(proteinEingabe),
        kohlenhydrate: optionaleZahlAuslesen(kohlenhydrateEingabe),
        fett: optionaleZahlAuslesen(fettEingabe)
    };
}

function bildDateiPruefen(bildDatei) {
    if (bildDatei.size > MAXIMALE_BILDGROESSE) {
        throw new Error("Bitte verwende ein Bild mit höchstens 5 MB.");
    }
    if (!ERLAUBTE_BILDTYPEN.includes(bildDatei.type)) {
        throw new Error("Bitte verwende ein JPEG-, PNG- oder WebP-Bild.");
    }
}

async function bildHochladen(bildDatei, gruppenId) {
    bildDateiPruefen(bildDatei);
    const dateiendung = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[bildDatei.type];
    const bildPfad = gruppenId + "/" + crypto.randomUUID() + "." + dateiendung;
    datenAusErgebnis(
        await supabaseClient.storage.from(BILD_SPEICHER).upload(bildPfad, bildDatei, {
            cacheControl: "3600",
            contentType: bildDatei.type,
            upsert: false
        }),
        "Das Bild konnte nicht hochgeladen werden."
    );
    return bildPfad;
}

async function bildEntfernen(bildPfad) {
    if (!bildPfad) return;
    datenAusErgebnis(
        await supabaseClient.storage.from(BILD_SPEICHER).remove([bildPfad]),
        "Das alte Bild konnte nicht entfernt werden."
    );
}

async function rezeptSpeichern() {
    if (!darfRezepteBearbeiten()) throw new Error("Du darfst in dieser Gruppe nur Rezepte ansehen.");
    const rezeptDaten = rezeptDatenAusFormular();
    const neuesBild = rezeptBildEingabe.files[0] || null;
    let neuerBildPfad = vorhandenerBildPfad;
    let neuesBildWurdeHochgeladen = false;

    if (neuesBild) {
        neuerBildPfad = await bildHochladen(neuesBild, aktiveGruppenId);
        neuesBildWurdeHochgeladen = true;
    }

    const datenbankDaten = { ...rezeptDaten, bild_pfad: neuerBildPfad };
    try {
        if (bearbeitetesRezeptId) {
            await serverFunktion("rezept-speichern", { id: bearbeitetesRezeptId, version: bearbeiteteVersion, daten: datenbankDaten });
        } else {
            datenAusErgebnis(
                await supabaseClient.from("rezepte").insert({
                    ...datenbankDaten,
                    gruppen_id: aktiveGruppenId,
                    erstellt_von: aktiverBenutzer.id
                }).select("id").single(),
                "Das Rezept konnte nicht hinzugefügt werden."
            );
        }
    } catch (fehler) {
        if (neuesBildWurdeHochgeladen) await bildEntfernen(neuerBildPfad).catch(function () {});
        throw fehler;
    }

    if (neuesBildWurdeHochgeladen && vorhandenerBildPfad && vorhandenerBildPfad !== neuerBildPfad) {
        await bildEntfernen(vorhandenerBildPfad).catch(function (fehler) { console.warn(fehler.message); });
    }
    formularZuruecksetzen();
    await gruppenLaden(aktiveGruppenId);
    ansichtAnzeigen("rezepte");
}

async function rezeptLoeschen(rezept) {
    if (!darfRezeptLoeschen(rezept)) throw new Error("Du darfst dieses Rezept nicht löschen.");
    const wirklichLoeschen = await bestaetigungFragen(
        "Rezept löschen?",
        "Möchtest du „" + rezept.name + "“ wirklich dauerhaft löschen?",
        "Rezept löschen",
        true
    );
    if (!wirklichLoeschen) return;

    datenAusErgebnis(
        await supabaseClient.rpc("rezept_loeschen", { p_id: rezept.id, p_version: rezept.version }),
        "Das Rezept konnte nicht gelöscht werden."
    );
    if (rezept.bildPfad) {
        await bildEntfernen(rezept.bildPfad).catch(function (fehler) { console.warn(fehler.message); });
    }
    rezeptDetailDialog.close();
    ausgewaehltesRezept = null;
    await gruppenLaden(aktiveGruppenId);
}

function gruppenListeAnzeigen() {
    gruppenListe.replaceChildren();
    if (gruppen.length === 0) {
        gruppenListe.append(elementErstellen("p", "leerer-hinweis", "Du hast noch keine Gruppen."));
        return;
    }
    gruppen.forEach(function (gruppe) { gruppenListe.append(gruppenElementErstellen(gruppe)); });
}

async function gruppenDetailsLaden(gruppe) {
    const daten = datenAusErgebnis(
        await supabaseClient.from("gruppen_mitglieder")
            .select("rolle, profil:profile!gruppen_mitglieder_benutzer_id_fkey(id, anzeigename, bild_pfad)")
            .eq("gruppen_id", gruppe.id),
        "Die Mitglieder konnten nicht geladen werden."
    );
    const mitglieder = daten.map(function (eintrag) {
        const profil = verknuepftesObjekt(eintrag.profil);
        return { id: profil.id, anzeigename: profil.anzeigename, bildPfad: profil.bild_pfad, rolle: eintrag.rolle };
    }).sort(function (a, b) {
        if (a.rolle !== b.rolle) {
            const reihenfolge = { admin: 0, mitglied: 1, beobachter: 2 };
            return reihenfolge[a.rolle] - reihenfolge[b.rolle];
        }
        return a.anzeigename.localeCompare(b.anzeigename, "de");
    });
    return { ...gruppe, mitglieder: mitglieder };
}

function einladungsLinkErstellen(token) {
    const link = new URL(window.location.href);
    link.search = "";
    link.hash = "";
    link.searchParams.set("einladung", token);
    return link.toString();
}

function einladungsParameterEntfernen() {
    const adresse = new URL(window.location.href);
    adresse.searchParams.delete("einladung");
    history.replaceState({}, "", adresse.pathname + adresse.search + adresse.hash);
    einladungsHinweis.hidden = true;
}

async function einladungAnnehmenWennVorhanden() {
    const token = new URLSearchParams(window.location.search).get("einladung");
    if (!token || !aktiverBenutzer) return null;
    try {
        const gruppenId = datenAusErgebnis(
            await supabaseClient.rpc("einladung_annehmen", { p_token: token }),
            "Die Einladung konnte nicht angenommen werden."
        );
        einladungsParameterEntfernen();
        return Number(gruppenId);
    } catch (fehler) {
        gruppenMeldung.textContent = fehler.message;
        return null;
    }
}

navigationsButtons.forEach(function (button) {
    button.addEventListener("click", function () { ansichtSicherWechseln(button.dataset.ansicht); });
});



anmeldeFormular.addEventListener("submit", async function (event) {
    event.preventDefault();

    authMeldung.textContent = "";
    authMeldung.classList.remove("erfolgsmeldung");

    try {
        if (anmeldeCaptchaId === undefined) {
            throw new Error("CAPTCHA wurde noch nicht geladen.");
        }

        const captchaToken = hcaptcha.getResponse(anmeldeCaptchaId);

        if (!captchaToken) {
            throw new Error("Bitte bestätige zuerst das CAPTCHA.");
        }

        const daten = datenAusErgebnis(
            await supabaseClient.auth.signInWithPassword({
                email: document.querySelector("#anmelde-email").value.trim(),
                password: document.querySelector("#anmelde-passwort").value,
                options: {
                    captchaToken: captchaToken
                }
            }),
            "Die Anmeldung ist fehlgeschlagen."
        );

        aktiverBenutzer = await benutzerAusSitzungLaden(daten.user);
        await angemeldeteAppLaden();

    } catch (fehler) {
        authMeldung.textContent = fehler.message;
        if (anmeldeCaptchaId !== undefined) {
            hcaptcha.reset(anmeldeCaptchaId);
        }
    }
});



registrierFormular.addEventListener("submit", async function (event) {
    event.preventDefault();

    authMeldung.textContent = "";
    authMeldung.classList.remove("erfolgsmeldung");

    const anzeigename = document.querySelector("#registrier-name").value.trim();
    const email = document.querySelector("#registrier-email").value.trim();
    const passwort = document.querySelector("#registrier-passwort").value;

    if (!anzeigename || anzeigename.length > 60 || passwort.length < 8) {
        authMeldung.textContent = "Bitte verwende einen Namen und mindestens 8 Zeichen als Passwort.";
        return;
    }

    try {
        // CAPTCHA-Token auslesen
        const captchaToken = hcaptcha.getResponse(registrierCaptchaId);

        if (!captchaToken) {
            authMeldung.textContent = "Bitte bestätige zuerst das CAPTCHA.";
            return;
        }

        // Registrierung bei Supabase
        const daten = datenAusErgebnis(
            await supabaseClient.auth.signUp({
                email: email,
                password: passwort,
                options: {
                    data: { anzeigename: anzeigename },
                    emailRedirectTo: window.location.href,
                    captchaToken: captchaToken
                }
            }),
            "Das Konto konnte nicht erstellt werden."
        );

        // Prüfen, ob eine Sitzung vorhanden ist
        if (!daten.session) {
            authMeldung.classList.add("erfolgsmeldung");
            authMeldung.textContent =
                "Das Konto wurde erstellt. Bitte melde dich an.";
            return;
        }

        // Benutzer anmelden
        aktiverBenutzer = await benutzerAusSitzungLaden(daten.user);
        await angemeldeteAppLaden();

    } catch (fehler) {
        authMeldung.textContent = fehler.message;
        if (typeof hcaptcha !== "undefined") {
            hcaptcha.reset();
        }
    }
});


abmeldenButton.addEventListener("click", async function () {
    if (aktiveAnsicht === "hinzufuegen" && formularGeaendert) {
        const verwerfen = await bestaetigungFragen(
            "Änderungen verwerfen?",
            "Ungespeicherte Eingaben gehen beim Abmelden verloren.",
            "Abmelden",
            true
        );
        if (!verwerfen) return;
    }
    datenAusErgebnis(await supabaseClient.auth.signOut(), "Das Abmelden ist fehlgeschlagen.");
    aktiverBenutzer = null;
    gruppen = [];
    rezepte = [];
    aktiveGruppenId = null;
    alleGruppenAnzeigen = false;
    rezeptLadeNummer++;
    localStorage.removeItem("aktiveGruppenId");
    formularZuruecksetzen();
    anmeldeFormular.reset();
    registrierFormular.reset();
    anmeldeAnsichtAnzeigen();
});

profilButton.addEventListener("click", function () {
    const wirdGeoeffnet = profilAuswahl.hidden;
    profilAuswahl.hidden = !wirdGeoeffnet;
    profilButton.setAttribute("aria-expanded", String(wirdGeoeffnet));
});

document.addEventListener("click", function (event) {
    if (!benutzerMenue.contains(event.target)) {
        profilAuswahl.hidden = true;
        profilButton.setAttribute("aria-expanded", "false");
    }
});

gruppenAuswahl.addEventListener("change", async function (event) {
    event.stopPropagation();
    const neuerEntwurf = aktiveAnsicht === "hinzufuegen" && !bearbeitetesRezeptId;
    const istAlle = aktiveAnsicht === "rezepte" && gruppenAuswahl.value === "alle";
    const neueGruppenId = istAlle ? aktiveGruppenId : Number(gruppenAuswahl.value);
    if (aktiveAnsicht === "hinzufuegen" && !neuerEntwurf && formularGeaendert) {
        const verwerfen = await bestaetigungFragen(
            "Gruppe wechseln?", "Ungespeicherte Eingaben werden verworfen.", "Gruppe wechseln", true
        );
        if (!verwerfen) {
            gruppenAuswahl.value = aktiveGruppenId;
            return;
        }
    }
    if (aktiveAnsicht === "rezepte") alleGruppenAnzeigen = istAlle;
    aktiveGruppenId = neueGruppenId;
    if (aktiveGruppenId) localStorage.setItem("aktiveGruppenId", aktiveGruppenId);
    if (!neuerEntwurf) formularZuruecksetzen();
    try { await rezepteLaden(); }
    catch (fehler) { rezeptListe.replaceChildren(elementErstellen("p", "fehlermeldung", fehler.message)); }

});

neueGruppeButton.addEventListener("click", function () {
    gruppenFormular.hidden = false;
    document.querySelector("#gruppen-name").focus();
});

gruppeErstellenAbbrechen.addEventListener("click", function () {
    gruppenFormular.reset();
    gruppenFormular.hidden = true;
});

gruppenFormular.addEventListener("submit", async function (event) {
    event.preventDefault();
    gruppenMeldung.textContent = "";
    try {
        const gruppenId = datenAusErgebnis(
            await supabaseClient.rpc("gruppe_erstellen", {
                p_name: document.querySelector("#gruppen-name").value,
                p_neue_nur_ansehen: document.querySelector("#gruppe-nur-ansehen").checked
            }),
            "Die Gruppe konnte nicht erstellt werden."
        );
        gruppenFormular.reset();
        gruppenFormular.hidden = true;
        await gruppenLaden(Number(gruppenId));
        ansichtAnzeigen("gruppen");
    } catch (fehler) {
        gruppenMeldung.textContent = fehler.message;
    }
});

rezeptSuche.addEventListener("input", rezeptListeAnzeigen);
rezeptFormular.addEventListener("input", function (event) { if (event.target !== gruppenAuswahl) formularGeaendert = true; });
rezeptFormular.addEventListener("change", function (event) { if (event.target !== gruppenAuswahl) formularGeaendert = true; });
rezeptFormular.addEventListener("submit", async function (event) {
    event.preventDefault();
    rezeptMeldung.textContent = "";
    speichernButton.disabled = true;
    try {
        await rezeptSpeichern();
    } catch (fehler) {
        rezeptMeldung.textContent = fehler.message;
    } finally {
        speichernButton.disabled = false;
    }
});

abbrechenButton.addEventListener("click", async function () {
    if (formularGeaendert) {
        const verwerfen = await bestaetigungFragen(
            "Bearbeitung abbrechen?", "Ungespeicherte Änderungen gehen verloren.", "Verwerfen", true
        );
        if (!verwerfen) return;
    }
    formularZuruecksetzen();
    ansichtAnzeigen("rezepte");
});

rezeptDetailSchliessen.addEventListener("click", function () { rezeptDetailDialog.close(); });
rezeptBearbeitenButton.addEventListener("click", function () {
    if (ausgewaehltesRezept) {
        rezeptDetailDialog.close();
        rezeptBearbeiten(ausgewaehltesRezept);
    }
});
rezeptLoeschenButton.addEventListener("click", async function () {
    if (ausgewaehltesRezept) {
        try {
            await rezeptLoeschen(ausgewaehltesRezept);
        } catch (fehler) {
            rezeptDetailInhalt.append(elementErstellen("p", "fehlermeldung", fehler.message));
        }
    }
});

bestaetigungAbbrechen.addEventListener("click", function () { bestaetigungBeenden(false); });
bestaetigungOk.addEventListener("click", function () { bestaetigungBeenden(true); });
bestaetigungsDialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    bestaetigungBeenden(false);
});

// Auch dynamisch erzeugte Dialoge schließen bei einem Klick auf den Hintergrund.
// Beide Klickpunkte müssen außerhalb liegen, damit Textauswahl nicht versehentlich schließt.
let dialogHintergrundStart = null;
function istDialogHintergrund(event) {
    if (!(event.target instanceof HTMLDialogElement) || !event.target.open) return false;
    const rect = event.target.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
}
document.addEventListener("pointerdown", event => {
    dialogHintergrundStart = istDialogHintergrund(event) ? event.target : null;
});
document.addEventListener("pointercancel", () => { dialogHintergrundStart = null; });
document.addEventListener("click", event => {
    const dialog = dialogHintergrundStart;
    dialogHintergrundStart = null;
    if (!dialog || event.target !== dialog || !istDialogHintergrund(event)) return;
    const abbrechen = new Event("cancel", { cancelable: true });
    if (dialog.dispatchEvent(abbrechen) && dialog.open) dialog.close();
});

if (new URLSearchParams(window.location.search).has("einladung")) einladungsHinweis.hidden = false;

async function anwendungStarten() {
    supabaseClient = supabaseVerbinden();
    await sitzungLaden();
}

erweiterungenInitialisieren();

anwendungStarten().catch(function (fehler) {
    authMeldung.textContent = "Die Anwendung konnte nicht geladen werden: " + fehler.message;
    anmeldeAnsichtAnzeigen();
});
