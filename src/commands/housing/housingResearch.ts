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

const provider = new PaissaProvider();

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

function buildAutocompleteChoices(
  currentValue: string,
  allOptions: string[],
  limit = 25
): { name: string; value: string }[] {
  const parts = currentValue.split(',');
  const lastRaw = parts.pop() ?? '';
  const last = lastRaw.trim();
  const alreadyRaw = parts.map(s => s.trim()).filter(Boolean);
  const already = Array.from(new Set(alreadyRaw.map(a => a.toLowerCase())));
  const choices = allOptions
    .filter(opt => !already.includes(opt.toLowerCase()))
    .filter(opt => opt.toLowerCase().startsWith(last.toLowerCase()))
    .slice(0, limit);
  const prefix = alreadyRaw.length ? alreadyRaw.join(', ') + (lastRaw.length ? ', ' : ', ') : '';
  return choices.map(opt => ({ name: opt, value: prefix + opt }));
}

export default {
  name: 'research',
  description: 'Search for available housing plots and DM the result',
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
  async execute(interaction: ChatInputCommandInteraction) {
    const dc = interaction.options.getString('datacenter', true);
    const world = interaction.options.getString('world', true);
    const districtsStr = interaction.options.getString('districts') ?? '';
    const fc = interaction.options.getString('fc') ?? 'beides';
    const sizeOpt = interaction.options.getString('size') ?? 'any';
    const intro = 'House Report';

    const districts = splitCommalist(districtsStr);
    const start = Date.now();
    const plots = await provider.fetchFreePlots(dc, world, districts);
    const now = Date.now();
    let filtered = plots.filter(
      (p) => p.ward > 0 && (p.lottery.phaseUntil === undefined || p.lottery.phaseUntil > now),
    );
    if (fc !== 'beides') {
      const want = fc === 'ja';
      filtered = filtered.filter(p => p.fcOnly === want);
    }
    if (sizeOpt !== 'any') {
      filtered = filtered.filter(p => p.size === sizeOpt);
    }
    const elapsedMs = Date.now() - start;
    const secs = Math.floor(elapsedMs / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const summary =
      `${intro}\n` +
      `Datacenter: ${dc}\n` +
      `World: ${world}\n` +
      `Districts: ${districts.length ? districts.join(', ') : 'All'}\n` +
      `FC Available: ${fc}\n` +
      `Size: ${sizeOpt}\n` +
      `Search Time: ${hh}:${mm}:${ss}\n` +
      `Found ${filtered.length} plots.`;

    await interaction.reply({
      content: 'Ergebnisse werden per DM gesendet.',
      flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
    });

    let dm;
    try {
      dm = await interaction.user.createDM();
    } catch {
      return;
    }

    await dm.send(summary);

    if (!filtered.length) {
      await dm.send('Keine freien Grundstücke gefunden.');
      return;
    }
    for (const p of filtered) {
      const { embed, attachment } = plotEmbed(p);
      await dm.send({ embeds: [embed], files: attachment ? [attachment] : [] });
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'world') {
      const dc = interaction.options.getString('datacenter');
      const worlds = dc ? await getWorldNamesByDC(dc) : [];
      const val = String(focused.value).toLowerCase();
      const choices = worlds
        .filter(w => w.toLowerCase().startsWith(val))
        .slice(0, 25)
        .map(w => ({ name: w, value: w }));
      await interaction.respond(choices);
      return;
    }
    if (focused.name === 'districts') {
      const val = String(focused.value);
      const all = DISTRICT_OPTIONS.map(d => d.value);
      const choices = buildAutocompleteChoices(val, all);
      await interaction.respond(choices);
      return;
    }
  },
};

