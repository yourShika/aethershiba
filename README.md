<!-- README for GitHub (pure HTML, no CSS) -->

<h1 id="start" align="center">AetherShiba – FFXIV Discord Bot</h1>

<p align="center">
  Nützliche Helferlein für Final Fantasy XIV: Housing-Scanner, Marktbrett-Tools, Event-Planung, Benachrichtigungen und mehr – alles direkt in Discord.
</p>

<hr>

<!-- Inhaltsverzeichnis / Pagination (Anker-Navigation) -->
<nav aria-label="Seitennavigation">
  <p><strong>Inhalt:</strong>
    <a href="#kurz">Kurze Beschreibung</a><n> ·
    <a href="#schnellstart">Schnellstart</a> ·
    <a href="#nutzung">Nutzung</a> ·
    <a href="#apis">API</a> ·
    <a href="#features">Funktionen</a> ·
    <a href="#wie-wo">Erkärung</a> ·
    <a href="#daten">Daten</a> ·
    <a href="#lizenz">Lizenz</a> ·
    <a href="#roadmap">Roadmap</a> ·
    <a href="#faq">FAQ</a> ·
    <a href="#kontakt">Kontakt</a>
  </p>
</nav>

<hr>

<h2 id="kurz">1) Kurze Beschreibung</h2>
<p>
  <strong>AetherShiba</strong> ist ein modularer Discord-Bot für FFXIV. Er liefert Housing-Verfügbarkeit je Datenzentrum,
  beobachtet Marktpreise, erinnert an Resets und Events, hilft bei Hunts und bietet Community-Features wie Fashion-Report-Voting
  oder Mini-Games. Architektur: leichtgewichtig, erweiterbar, mit klaren Modulen pro Feature.
</p>

<p><em>Status-Übersicht:</em> <strong>Implementiert</strong> = produktionsreif · <strong>W.I.P</strong> = in Arbeit</p>

<p><a href="#start">↑ nach oben</a> · <a href="#schnellstart">nächster Abschnitt →</a></p>
<hr>

<h2 id="schnellstart">2) Schnellstart</h2>
<ol>
  <li><strong>Voraussetzungen:</strong> Discord-Server, Bot-Token, Node.js oder Python (je nach Implementierung), sowie optional API-Schlüssel (siehe <a href="#apis">APIs</a>).</li>
  <li><strong>Installieren:</strong></li>
</ol>

<pre><code># Klone das Repo
git clone &lt;DEIN-REPO-URL&gt;
cd &lt;repo&gt;

# Abhängigkeiten (Beispiel Node)
npm install

</code></pre>

<ol start="3">
  <li><strong>Konfigurieren:</strong> Lege eine <code>.env</code> an (siehe <a href="#konfiguration">Konfiguration</a>).</li>
  <li><strong>Starten:</strong></li>
</ol>

<pre><code># Node (Beispiel)
npm run start

</code></pre>

<p><a href="#kurz">← vorheriger Abschnitt</a> · <a href="#konfiguration">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="konfiguration">3) Konfiguration</h2>
<p>Erzeuge eine <code>.env</code> in der Projektwurzel mit u. a. folgenden Variablen (je nach Tech-Stack können Namen abweichen):</p>

<pre><code># Pflicht
DISCORD_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
</code></pre>

<p>Tipp: Slash-Commands (Interactions) bei neuen Deploys ggf. neu registrieren.</p>

<p><a href="#schnellstart">← vorheriger Abschnitt</a> · <a href="#nutzung">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="apis">5) Welche APIs werden genutzt?</h2>
<ul>
  <li><strong>Discord API</strong> (Gateway, REST, Interactions/Slash Commands, OAuth2 für Account-Linking)</li>
  <li><strong>Universalis</strong> (Marktbrett-Preise &amp; Historie)</li>
  <li><strong>XIVAPI</strong> (Spiel-Daten wie Items, Jobs, Icons, ggf. Lodestone-Proxy)</li>
  <li><strong>Lodestone</strong> (Charakter-/Free-Company-Daten; via offizielle Seiten/Community-Lösungen)</li>
  <li><strong>Hunt-Daten</strong> (Community-Quellen, soweit verfügbar/zugelassen)</li>
  <li><strong>Kalender/Benachrichtigung</strong> (z. B. interne Scheduler, Cron, Webhooks)</li>
</ul>

<p><em>Hinweis:</em> Die konkrete Nutzung hängt von aktivierten Modulen/Schlüsseln ab.</p>

<p><a href="#nutzung">← vorheriger Abschnitt</a> · <a href="#features">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="features">6) Aufgaben des Bots (Feature-Liste)</h2>
<ul>
  <li><strong>Listing von freien Häusern</strong> auf allen Datenzentren <strong>(Implementiert)</strong></li>
  <li><strong>Gehilfen-Verfolgung</strong> (Verkaufs-Tracking deiner Retainer inkl. Benachrichtigungen) <strong>(W.I.P)</strong></li>
  <li><strong>Daily- &amp; Weekly-Reset</strong> Benachrichtigungen, Event-Planung <strong>(W.I.P)</strong></li>
  <li><strong>Marktbrett-Preisalarm</strong> (Auto-Alerts bei Zielpreis/Preisschwankung) <strong>(W.I.P)</strong></li>
  <li><strong>Marktbrett-Deals</strong> (30 günstige Kauf/teurer Verkauf-Kandidaten zwischen Welten) <strong>(W.I.P)</strong></li>
  <li><strong>Hunt-Notifikationen</strong> (S-/A-Rank Spawns, Integration zu Hunt-Linkshell-Daten, falls möglich) <strong>(W.I.P)</strong></li>
  <li><strong>Gold Saucer Events</strong> (MGP-Events, Fashion-Report-Reminder mit Guide-Links) <strong>(W.I.P)</strong></li>
  <li><strong>Accounts-Linking mit Discord</strong> (Rollen via Reactions, Mehrfach-Char-Linking via Lodestone/Codes) <strong>(W.I.P)</strong></li>
  <li><strong>Fashion Report Guessing</strong> (Community-Voting/Predictions) <strong>(W.I.P)</strong></li>
  <li><strong>Events-Planung</strong> (Raids, Schatzkarten; Guide-Links, Bilder) <strong>(W.I.P)</strong></li>
  <li><strong>Triple Triad Minigame</strong> im Discord-Channel <strong>(W.I.P)</strong></li>
  <li><strong>Fashion Report Simulator</strong> (Outfits posten, Community stimmt ab, Punktevergabe) <strong>(W.I.P)</strong></li>
  <li><strong>Marktbrett-Quiz</strong> (Item + Region → Preis raten) <strong>(W.I.P)</strong></li>
  <li><strong>Official-Info/News/Störungen</strong> als Embed-Posts <strong>(W.I.P)</strong></li>
</ul>

<p><a href="#apis">← vorheriger Abschnitt</a> · <a href="#wie-wo">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="wie-wo">7) Erklärung: Was? Wie? Wo?</h2>
<h3>Was</h3>
<p>Ein Bot, der FFXIV-Informationen in Discord nutzbar macht: Marktpreise, Housing, Hunts, Events, Social-Tools.</p>

<h3>Wie</h3>
<ul>
  <li>Module/Kommandos je Feature (klare Trennung von Datenquellen und Logik).</li>
  <li>Benachrichtigungen via Discord-Embeds und (optional) Webhooks.</li>
  <li>Scheduler für Resets/Events (Cron/Jobs).</li>
  <li>Caching, Rate-Limits und Backoff, um API-Quellen zu schonen.</li>
</ul>

<h3>Wo</h3>
<ul>
  <li><strong>Lokal/Server/VPS</strong> möglich.</li>
  <li><strong>Docker</strong> empfohlen (Compose-Datei optional): ein Service für Bot, optional ein Service für Cache/DB (z. B. Redis/PostgreSQL).</li>
  <li>Datenspeicher: minimalistisch (nur, was für Features nötig ist).</li>
</ul>

<p><a href="#features">← vorheriger Abschnitt</a> · <a href="#daten">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="daten">8) Datenschutz &amp; Sicherheit</h2>
<ul>
  <li>Speichere nur notwendige Daten (z. B. User-IDs für Alarme/Verknüpfungen).</li>
  <li>Kein Speichern sensibler Inhalte aus Discord-Chats ohne Zustimmung.</li>
  <li>API-Schlüssel in <code>.env</code>; niemals ins Repo commiten.</li>
  <li>Beachte Nutzungsbedingungen/ToS der Datenquellen (Universalis, XIVAPI, Discord, etc.).</li>
  <li>Opt-out/Opt-in Mechanismen für Benachrichtigungen anbieten.</li>
</ul>

<p><a href="#wie-wo">← vorheriger Abschnitt</a> · <a href="#lizenz">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="lizenz">9) Lizenz</h2>
<p><strong>Alle Rechte vorbehalten.</strong> Der gesamte Quellcode, die Dokumentation und alle zugehörigen Assets von <em>[Projektname]</em>
unterliegen dem ausschließlichen Recht von <em>[Dein Name/Deine Organisation]</em>. Jegliche Verwendung, Vervielfältigung, Veränderung,
Verbreitung oder Veröffentlichung – ganz oder in Teilen – ist ohne vorherige, ausdrückliche und schriftliche Zustimmung untersagt.</p>

<p>Ausnahmegenehmigungen (z. B. für private Tests oder Beiträge) können individuell erteilt werden und sind widerrufbar.
Mit dem Einreichen eines Pull Requests überträgst du uns das zeitlich und räumlich unbeschränkte, nicht-exklusive Recht,
den Beitrag in diesem Projekt zu nutzen, zu ändern und zu verbreiten.</p>

<p><a href="#daten">← vorheriger Abschnitt</a> · <a href="#roadmap">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="roadmap">10) Roadmap, Beiträge &amp; Changelog</h2>
<h3>Roadmap (Kurz)</h3>
<ul>
  <li>Stabilisierung Marktalarme (W.I.P)</li>
  <li>Hunt-Datenquellen evaluieren &amp; integrieren (W.I.P)</li>
  <li>Event-Planung mit Vorlagen/Guides (W.I.P)</li>
  <li>Gehilfen-Tracking-UI in Discord (W.I.P)</li>
</ul>

<h3>Mitmachen</h3>
<ol>
  <li>Issue anlegen (Fehler/Feature-Wunsch klar beschreiben).</li>
  <li>Branch erstellen, Änderungen committen, Pull Request öffnen.</li>
  <li>Bitte Code-Kommentare und einfache Tests beilegen.</li>
</ol>

<h3>Changelog</h3>
<ul>
  <li><strong>[YYYY-MM-DD]</strong> – Erste stabile Housing-Listings (Implementiert)</li>
  <li><strong>[YYYY-MM-DD]</strong> – Grundgerüst für Marktalarme (W.I.P)</li>
</ul>

<p><a href="#lizenz">← vorheriger Abschnitt</a> · <a href="#faq">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="faq">11) FAQ</h2>
<details>
  <summary>Welche Datenzentren werden unterstützt?</summary>
  <p>Alle öffentlichen Datenzentren, sofern die genutzten APIs diese abdecken. Standard: <code>DEFAULT_DATACENTER</code> aus der Konfiguration.</p>
</details>
<details>
  <summary>Kann ich mehrere Discord-Server/Guilds nutzen?</summary>
  <p>Ja. Trenne die IDs durch Komma in <code>DISCORD_GUILD_IDS</code>.</p>
</details>
<details>
  <summary>Wie richte ich Rollen-Automatiken ein?</summary>
  <p>Aktiviere Account-Linking und Reactions; definiere eine Zuordnung (z. B. Tank/Healer/DPS) in deiner Konfiguration.</p>
</details>

<p><a href="#roadmap">← vorheriger Abschnitt</a> · <a href="#kontakt">nächster Abschnitt →</a> · <a href="#start">↑ nach oben</a></p>
<hr>

<h2 id="kontakt">12) Kontakt &amp; Support</h2>
<ul>
  <li><strong>Issues</strong>: Bitte im GitHub-Issue-Tracker melden (mit Logs/Schritten).</li>
  <li><strong>Fragen</strong>: Nutze Discussions oder deinen Discord-Support-Channel.</li>
  <li><strong>Screenshots/Beispiele</strong>: Füge Bilder/Links in Issues/PRs ein (kein sensibler Inhalt).</li>
</ul>

<p align="center"><a href="#start">↑ zurück zum Anfang</a></p>
