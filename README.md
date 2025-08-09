<h1 align="center">AetherShiba — Discord Bot for Final Fantasy XIV</h1>

<p align="center">
  <em>Smart alerts, market insights, and handy slash commands for Eorzea.</em><br/>
  <a href="https://github.com/KamilBura/aerthershiba">Repository</a>
</p>

<hr/>

<h2>✨ What AetherShiba Does</h2>
<ul>
  <li><strong>Daily Reset pings</strong>: Get a reminder at reset time (weeklies, dailies, custom checklists).</li>
  <li><strong>Housing watch</strong>: Track <em>free plots</em> / lotteries opening per World, with district &amp; size filters.</li>
  <li><strong>Market arbitrage (intra-World/DC)</strong>: See <em>what’s worth buying</em> and selling within your World or DC (price gaps, fees, taxes).</li>
  <li><strong>Profile lookups</strong>: Slash commands to inspect player profiles, jobs, ilvl, glam, achievements (where available).</li>
  <li><strong>Server-aware timezones</strong>: Converts reset times and alerts to your local timezone.</li>
</ul>

<h3>🧭 Philosophy</h3>
<p>
  Keep it lean and Discord-first. No external dashboards planned right now—configuration lives in slash commands and server settings.
</p>

<hr/>

<h2>📦 Setup (self-host)</h2>
<ol>
  <li>Create a Discord application and bot; enable the necessary <strong>Privileged Gateway Intents</strong> (Guild Members, Message Content if required).</li>
  <li>Clone the repo: <code>git clone https://github.com/KamilBura/aerthershiba</code></li>
  <li>Configure environment variables (see <code>.env.example</code> if present):
    <ul>
      <li><code>DISCORD_TOKEN</code> — your bot token</li>
      <li><code>APPLICATION_ID</code> — for slash commands</li>
      <li><code>XIV_API_KEYS</code> / <code>MARKET_API_KEYS</code> — for data providers</li>
      <li><code>DEFAULT_REGION</code>, <code>TIMEZONE</code> — optional defaults</li>
      <li><code>DATABASE_URL</code> — SQLite/Postgres (subscriptions, alerts, cache)</li>
    </ul>
  </li>
  <li>Install dependencies &amp; run:
    <pre><code># example
pnpm install
pnpm build
pnpm start
</code></pre>
  </li>
</ol>

<hr/>

<h2>🔐 Permissions &amp; Channels</h2>
<ul>
  <li>Recommended intents: <code>GUILD_MEMBERS</code>, <code>GUILD_MESSAGES</code>, <code>MESSAGE_CONTENT</code> (only if you need it), <code>GUILD_SCHEDULED_EVENTS</code>.</li>
  <li>Create dedicated channels like <code>#ffxiv-resets</code>, <code>#housing</code>, <code>#market</code> and assign opt-in roles (e.g., <code>@Housing</code>, <code>@Market</code>).</li>
</ul>

<hr/>

<h2>🗺️ Future (maybe later)</h2>
<ul>
  <li><strong>Crafting &amp; gathering helpers</strong>: Profit per craft, material shopping lists, vendor vs. MB comparisons.</li>
  <li><strong>Cross-DC arbitrage</strong>: Factor DC travel cost &amp; time into net profit.</li>
  <li><strong>Patch &amp; maintenance alerts</strong>: Official notices summarized with exact windows for your region.</li>
  <li><strong>Raid &amp; tomestone trackers</strong>: Weekly lockout status and capped tomes remaining.</li>
  <li><strong>Island Sanctuary &amp; custom rotations</strong>: Timers and recommended rotations with estimated gil/hour.</li>
  <li><strong>Hunt/Map event support</strong>: Schedule pings for trains, S-rank windows, and treasure map parties.</li>
  <li><strong>Smarter alert throttling</strong>: Per-user quiet hours; spam protection.</li>
</ul>

<hr/>

<h2>⚖️ Disclaimer</h2>
<p>
  AetherShiba is an independent fan project and is not affiliated with or endorsed by SQUARE ENIX CO., LTD.
  Use of third‑party APIs must comply with their terms. Please follow the FFXIV Terms of Service and your data
  provider’s rate limits and policies.
</p>

<hr/>

<h2>🤝 Contributing</h2>
<p>
  Issues and PRs are welcome! If you’re adding a data provider or new command set, include docs and tests where possible.
</p>

<p align="center">
  <sub>Made with ❤️ for Eorzea.</sub>
</p>
