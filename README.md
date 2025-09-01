<!-- README for GitHub (pure HTML, no CSS) -->

<h1 align="center">🐾 AetherShiba – FFXIV Discord Bot</h1>

<p align="center">
  Ein modularer Discord-Bot für Final Fantasy XIV: Housing-Scanner, Marktbrett-Alarme, Event-Planung, Hunts, Community-Features und mehr.
</p>

<hr>

<!-- Einfache Pagination / Schnellzugriffe mit Kurzbeschreibung -->
<nav aria-label="Schnellzugriff">
  <p><strong>⚡ Schnellzugriff:</strong></p>
  <ul>
    <li>🧭 <a href="#kurz">Kurze Beschreibung</a> – Worum es geht & Architektur auf einen Blick.</li>
    <li>🚀 <a href="#schnellstart">Schnellstart</a> – Repo klonen & Bot starten (Beispiel Node/Python).</li>
    <li>⌨️ <a href="#nutzung">Nutzung</a> – Wichtige Slash-Befehle im Alltag.</li>
    <li>🔌 <a href="#apis">APIs</a> – Welche Schnittstellen verwendet werden.</li>
    <li>🧩 <a href="#features">Aufgaben des Bots</a> – Implementiert & W.I.P-Funktionsliste.</li>
    <li>🛠️ <a href="#wie-wo">Erklärung: Was? Wie? Wo?</a> – Aufbau, Betrieb & Deployment.</li>
    <li>🔐 <a href="#daten">Datenschutz & Sicherheit</a> – Schonende Datennutzung & ToS.</li>
    <li>📜 <a href="#lizenz">Lizenz</a> – Alle Rechte vorbehalten.</li>
    <li>❓ <a href="#faq">FAQ</a> – Häufige Fragen kompakt.</li>
    <li>📬 <a href="#kontakt">Kontakt & Support</a> – Issues, Diskussionen, Hilfe.</li>
  </ul>
</nav>

<hr>

<h2 id="kurz">🧭 Kurze Beschreibung</h2>
<p>
  <strong>AetherShiba</strong> bringt FFXIV-Daten elegant in deinen Discord-Server: freie Häuser, Marktpreise, Hunts, Resets, Events
  und Community-Interaktionen. Die Architektur ist modular aufgebaut – jedes Feature als eigenes Modul mit klaren Zuständigkeiten.
</p>

<hr>

<h2 id="schnellstart">🚀 Schnellstart</h2>
<ol>
  <li><strong>Voraussetzungen:</strong> Discord-Server, Bot-Token, Node.js oder Python, ggf. API-Keys (siehe <a href="#apis">APIs</a>).</li>
  <li><strong>Installieren:</strong></li>
</ol>

<pre><code># Klone das Repo
git clone &lt;DEIN-REPO-URL&gt;
cd &lt;repo&gt;

# Abhängigkeiten (Beispiel Node)
npm install
</code></pre>

<ol start="3">
  <li><strong>Starten:</strong></li>
</ol>

<pre><code># Node (Beispiel)
npm run start
</code></pre>

<hr>

<h2 id="nutzung">⌨️ Nutzung (Befehlsbeispiele)</h2>
<ul>
  <li>🏠 <strong>/housing free</strong> – Zeigt freie Häuser pro Welt/Datenzentrum.</li>
  <li>🔔 <strong>/market alarm add</strong> – Preisalarm für ein Item anlegen.</li>
  <li>💱 <strong>/market deals</strong> – Potenzielle Arbitrage-Deals (30 Items).</li>
  <li>📆 <strong>/reset when</strong> – Tägliche/Wöchentliche Reset-Infos.</li>
  <li>🐉 <strong>/hunt watch</strong> – Notifikationen bei S-/A-Rank Hunts (falls Datenquelle aktiv).</li>
  <li>🎰 <strong>/gs events</strong> – Gold Saucer Events & Erinnerungen.</li>
  <li>🔗 <strong>/link account</strong> – Discord-Account mit Ingame-Char verknüpfen (Rollen via Reactions).</li>
  <li>🗺️ <strong>/events plan</strong> – Raids/Schatzkarten-Events erstellen (mit Links/Bildern).</li>
</ul>

<hr>

<h2 id="apis">🔌 Welche APIs werden genutzt?</h2>
<ul>
  <li>🤖 <strong>Discord API</strong> – Gateway, REST, Interactions/Slash Commands, OAuth2 für Account-Linking.</li>
  <li>📊 <strong>Universalis</strong> – Marktbrett-Preise &amp; Historie.</li>
  <li>🧱 <strong>XIVAPI</strong> – Spiel-Daten (Items, Jobs, Icons; ggf. Lodestone-Proxy).</li>
  <li>🪪 <strong>Lodestone</strong> – Charakter-/Free-Company-Daten (über offizielle Seiten/Community-Lösungen).</li>
  <li>📡 <strong>Hunt-Daten</strong> – Community-Quellen, soweit verfügbar/zugelassen.</li>
  <li>⏰ <strong>Kalender/Benachrichtigung</strong> – z. B. Scheduler, Cron, Webhooks.</li>
</ul>

<hr>

<h2 id="features">🧩 Aufgaben des Bots (Feature-Liste)</h2>
<ul>
  <li>🏠 <strong>Listing von freien Häusern</strong> auf allen Datenzentren <strong>(Implementiert)</strong></li>
  <li>📦 <strong>Gehilfen-Verfolgung</strong> (Verkaufs-Tracking deiner Retainer inkl. Benachrichtigungen) <strong>(W.I.P)</strong></li>
  <li>📆 <strong>Daily- &amp; Weekly-Reset</strong> Benachrichtigungen, Event-Planung <strong>(W.I.P)</strong></li>
  <li>🔔 <strong>Marktbrett-Preisalarm</strong> (Auto-Alerts bei Zielpreis/Preisschwankung) <strong>(W.I.P)</strong></li>
  <li>💹 <strong>Marktbrett-Deals</strong> (30 günstige Kauf/teurer Verkauf-Kandidaten zwischen Welten) <strong>(W.I.P)</strong></li>
  <li>🐉 <strong>Hunt-Notifikationen</strong> (S-/A-Rank Spawns, Integration zu Hunt-Linkshell-Daten, falls möglich) <strong>(W.I.P)</strong></li>
  <li>🎰 <strong>Gold Saucer Events</strong> (MGP-Events, Fashion-Report-Reminder mit Guide-Links) <strong>(W.I.P)</strong></li>
  <li>🔗 <strong>Accounts-Linking mit Discord</strong> (Rollen via Reactions, Mehrfach-Char-Linking via Lodestone/Codes) <strong>(W.I.P)</strong></li>
  <li>👗 <strong>Fashion Report Guessing</strong> (Community-Voting/Predictions) <strong>(W.I.P)</strong></li>
  <li>🗓️ <strong>Events-Planung</strong> (Raids, Schatzkarten; Guide-Links, Bilder) <strong>(W.I.P)</strong></li>
  <li>🃏 <strong>Triple Triad Minigame</strong> im Discord-Channel <strong>(W.I.P)</strong></li>
  <li>🪞 <strong>Fashion Report Simulator</strong> (Outfits posten, Community stimmt ab, Punktevergabe) <strong>(W.I.P)</strong></li>
  <li>🧠 <strong>Marktbrett-Quiz</strong> (Item + Region → Preis raten) <strong>(W.I.P)</strong></li>
  <li>📰 <strong>Official-Info/News/Störungen</strong> als Embed-Posts <strong>(W.I.P)</strong></li>
</ul>

<hr>

<h2 id="wie-wo">🛠️ Erklärung: Was? Wie? Wo?</h2>

<h3>❓ Was</h3>
<p>Ein Bot, der FFXIV-Informationen in Discord nutzbar macht: Marktpreise, Housing, Hunts, Events, Social-Tools.</p>

<h3>⚙️ Wie</h3>
<ul>
  <li>Module/Kommandos je Feature (Trennung Datenquellen ↔ Logik).</li>
  <li>Benachrichtigungen via Discord-Embeds und optional Webhooks.</li>
  <li>Scheduler für Resets/Events (Cron/Jobs).</li>
  <li>Caching, Rate-Limits &amp; Backoff zum Schutz der Quellen.</li>
</ul>

<h3>📍 Wo</h3>
<ul>
  <li><strong>Lokal/Server/VPS</strong> möglich.</li>
  <li><strong>Docker</strong> empfohlen: ein Service für den Bot, optional Cache/DB (z. B. Redis/PostgreSQL).</li>
  <li>Speichere nur, was die Features wirklich benötigen.</li>
</ul>

<hr>

<h2 id="daten">🔐 Datenschutz &amp; Sicherheit</h2>
<ul>
  <li>Minimalprinzip: nur notwendige Daten (z. B. User-IDs für Alarme/Linking).</li>
  <li>Keine sensiblen Chat-Inhalte ohne Zustimmung speichern.</li>
  <li>API-Schlüssel gehören in eine <code>.env</code> (nie ins Repo).</li>
  <li>Beachte ToS/Nutzungsbedingungen (Universalis, XIVAPI, Discord, …).</li>
  <li>Opt-in/Opt-out für Benachrichtigungen anbieten.</li>
</ul>

<hr>

<h2 id="lizenz">📜 Lizenz</h2>
<p><strong>Alle Rechte vorbehalten.</strong> Der gesamte Quellcode, die Dokumentation und alle zugehörigen Assets von <em>[Projektname]</em>
unterliegen dem ausschließlichen Recht von <em>[Dein Name/Deine Organisation]</em>. Jede Nutzung, Vervielfältigung, Veränderung,
Verbreitung oder Veröffentlichung – ganz oder teilweise – ist ohne vorherige, ausdrückliche, schriftliche Zustimmung untersagt.</p>
<p>Ausnahmen (z. B. für private Tests oder Beiträge) können individuell und widerruflich gestattet werden.
Mit dem Einreichen eines Pull Requests räumst du uns das zeitlich und räumlich unbeschränkte, nicht-exklusive Recht ein,
den Beitrag in diesem Projekt zu nutzen, zu ändern und zu verbreiten.</p>

<h2 id="faq">❓ FAQ</h2>
<details>
  <summary>🌐 Welche Datenzentren werden unterstützt?</summary>
  <p>Alle öffentlichen Datenzentren, sofern die genutzten APIs diese abdecken. Standard-DC kann projektspezifisch gesetzt werden.</p>
</details>
<details>
  <summary>🏰 Kann ich mehrere Discord-Server/Guilds nutzen?</summary>
  <p>Ja – der Bot kann für mehrere Guilds bereitgestellt werden.</p>
</details>
<details>
  <summary>🎭 Wie richte ich Rollen-Automatik ein?</summary>
  <p>Account-Linking aktivieren, Reactions konfigurieren und Mapping (z. B. Tank/Healer/DPS) definieren.</p>
</details>

<hr>

<h2 id="kontakt">📬 Kontakt &amp; Support</h2>
<ul>
  <li><strong>Issues:</strong> Fehler/Feature-Wünsche im GitHub-Issue-Tracker melden (mit Logs/Schritten).</li>
  <li><strong>Fragen:</strong> GitHub-Discussions oder deinen Discord-Support-Channel verwenden.</li>
  <li><strong>Screenshots/Beispiele:</strong> Bilder/Links in Issues/PRs anfügen (ohne sensible Inhalte).</li>
</ul>
