// commands/housing/housingResearch.ts

import {
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing.js';
import { getWorldNamesByDC } from '../../functions/housing/housingWorlds.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from './embed.js';

// PaissaDB API Provider
const provider = new PaissaProvider();

/**
 * Split a comma-seperated string into a list of unique, trimmed values.
 * Case-insensitive uniqueness is enforced; original casing is normalized to lower.
 * 
 * @param input - Values
 * @returns Values splitted with Comma "value, value, etc."
 */
function splitCommalist(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(',')) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (!seen.has(key)) seen.add(key);
  }
  return Array.from(seen).map(k => k);
}

/**
 * Build autocomplete options for a comma-augmented input field.
 * Preserves already-typed items and suggests the last (currently edited) token.
 * 
 * @param currentValue - Current Value tipped
 * @param allOptions - Show all Options
 * @param limit - Limit always to 25 
 * @returns All available Options for the choice.
 */
function buildAutocompleteChoices(
  currentValue: string,
  allOptions: string[],
  limit = 25
): { name: string; value: string }[] {
  const parts = currentValue.split(',');
  const lastRaw = parts.pop() ?? '';
  const last = lastRaw.trim();
  
  // Already selected items (case-insensitive de-dupe)
  const alreadyRaw = parts.map(s => s.trim()).filter(Boolean);
  const already = Array.from(new Set(alreadyRaw.map(a => a.toLowerCase())));

  // Filter out already selected, then match prefix for the last token
  const choices = allOptions
    .filter(opt => !already.includes(opt.toLowerCase()))
    .filter(opt => opt.toLowerCase().startsWith(last.toLowerCase()))
    .slice(0, limit);

  // Compose the value so selecting an option appends it to the CSV
  const prefix = alreadyRaw.length ? alreadyRaw.join(', ') + (lastRaw.length ? ', ' : ', ') : '';
  return choices.map(opt => ({ name: opt, value: prefix + opt }));
}

// ---------------------------------------------------
// /housing research
// ---------------------------------------------------
export default {
  name: 'research',
  description: 'Search for available housing plots and DM the result',

  /**
   * Define the /housing research subcommand schema.
   *  - datacenter: required, from fixed list.
   *  - world: required, autocompleted per selected DC
   *  - districts: optional CSV, autocompleted from known districts
   *  - fc: filter for Free Company-only availability
   *  - size: plot size filter
   * 
   * @param sc - Discord Slash Command Subcommand Builder
   */
  build(sc: SlashCommandSubcommandBuilder) {
    sc
      .addStringOption(opt =>
        opt
          .setName('datacenter')
          .setDescription('Datacenter')
          .setRequired(true)
          .addChoices(...DATACENTERS.map(dc => ({ name: dc, value: dc }))),
      )
      .addStringOption(opt =>
        opt
          .setName('world')
          .setDescription('World')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption(opt =>
        opt
          .setName('districts')
          .setDescription('Comma-separated districts')
          .setAutocomplete(true),
      )
      .addStringOption(opt =>
        opt
          .setName('fc')
          .setDescription('Free Company availability')
          .addChoices(
            { name: 'Ja', value: 'ja' },
            { name: 'Nein', value: 'nein' },
            { name: 'Beides', value: 'beides' },
          ),
      )
      .addStringOption(opt =>
        opt
          .setName('size')
          .setDescription('Plot size')
          .addChoices(
            { name: 'S', value: 'S' },
            { name: 'M', value: 'M' },
            { name: 'L', value: 'L' },
            { name: 'Beliebig', value: 'any' },
          ),
      );
    return sc;
  },

  /**
   * Execute the search:
   *  - Parse inputs and fetch plots from provider.
   *  - Filter by FC-only flag and size (if provided).
   *  - DM a summary + one embed per plot (with image if available).
   *  - Ephemeral ack in guild channels ("results sent via DM").
   * @param interaction - Discord Chat Input Command Interaction
   */
  async execute(interaction: ChatInputCommandInteraction) {

    // Get data from the Fields
    const dc = interaction.options.getString('datacenter', true);
    const world = interaction.options.getString('world', true);
    const districtsStr = interaction.options.getString('districts') ?? '';
    const fc = interaction.options.getString('fc') ?? 'beides';
    const sizeOpt = interaction.options.getString('size') ?? 'any';
    const intro = 'House Report';

    // Normalize CSV input to an array (case-insensitive, unique)
    const districts = splitCommalist(districtsStr);

    // Fetch plots and measure duration (for summary)
    const start = Date.now();
    const plots = await provider.fetchFreePlots(dc, world, districts);
    const now = Date.now();

    // Base filters: ward > 0 and (not past lottery cutoff)
    let filtered = plots.filter(
      (p) => p.ward > 0 && (p.lottery.phaseUntil === undefined || p.lottery.phaseUntil > now),
    );

    // FC-only filter
    if (fc !== 'beides') {
      const want = fc === 'ja';
      filtered = filtered.filter(p => p.fcOnly === want);
    }

    // Size filter
    if (sizeOpt !== 'any') {
      filtered = filtered.filter(p => p.size === sizeOpt);
    }

    // Human-readable elapsed time
    const elapsedMs = Date.now() - start;
    const secs = Math.floor(elapsedMs / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');

    // DM summary
    const summary =
      `${intro}\n` +
      `Datacenter: ${dc}\n` +
      `World: ${world}\n` +
      `Districts: ${districts.length ? districts.join(', ') : 'All'}\n` +
      `FC Available: ${fc}\n` +
      `Size: ${sizeOpt}\n` +
      `Search Time: ${hh}:${mm}:${ss}\n` +
      `Found ${filtered.length} plots.`;

    // Ephemeral ACK in guilds; public reply in DMs
    await interaction.reply({
      content: 'Ergebnisse werden per DM gesendet.',
      flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
    });

    // Open (or fail quietly) a DM channel to the requester
    let dm;
    try {
      dm = await interaction.user.createDM();
    } catch {
      // IF DMs are closed, we just stop-guild ack already sent.
      return;
    }

    // Send summary first.
    await dm.send(summary);

    // If nothing matched, send a signel "no results" message
    if (!filtered.length) {
      await dm.send('Keine freien Grundstücke gefunden.');
      return;
    }

    // Send one embed per plot (with image attachment when available)
    for (const p of filtered) {
      const { embed, attachment } = plotEmbed(p);
      await dm.send({ embeds: [embed], files: attachment ? [attachment] : [] });
    }
  },

  /**
   * Autocomplete handler:
   *  - world: suggests worlds for the selected datacenter.
   *  - districts: CSV-aware suggestions from known district list.
   * 
   * @param interaction - Discord Autocomplete Interaction
   */
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);

    // Suggest worlds for selected DC
    if (focused.name === 'world') {
      const dc = interaction.options.getString('datacenter'); // may be null if user hasn't chosen yet
      const worlds = dc ? await getWorldNamesByDC(dc) : [];
      const val = String(focused.value).toLowerCase();

      const choices = worlds
        .filter(w => w.toLowerCase().startsWith(val))
        .slice(0, 25)
        .map(w => ({ name: w, value: w }));

      await interaction.respond(choices);
      return;
    }
    // CSV-friendly district suggestions
    if (focused.name === 'districts') {
      const val = String(focused.value);
      const all = DISTRICT_OPTIONS.map(d => d.value);
      const choices = buildAutocompleteChoices(val, all);
      await interaction.respond(choices);
      return;
    }
  },
};

