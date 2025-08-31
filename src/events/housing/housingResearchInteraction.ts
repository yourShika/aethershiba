import {
  Client,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';
import { getWorldNamesByDC } from '../../functions/housing/housingWorlds.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from '../../commands/housing/embed.js';
import { HOUSING_PREFIX } from '../../commands/config/housingConfig.js';

type ResearchState = {
  dc?: string;
  world?: string;
  districts: string[];
  fc?: 'true' | 'false' | 'any';
  size?: 'any' | 'S' | 'M' | 'L';
};

const mem = new Map<string, ResearchState>();

const PREFIX = HOUSING_PREFIX + 'research:';

export function register(client: Client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!(interaction.isButton() || interaction.isStringSelectMenu())) return;
      if (!interaction.customId.startsWith(PREFIX)) return;

      const id = interaction.user.id;
      const state: ResearchState = mem.get(id) ?? { districts: [], fc: 'any', size: 'any' };

      const action = interaction.customId.slice(PREFIX.length);
      switch (action) {
        case 'dc':
          if (interaction.isStringSelectMenu()) {
            const dc = interaction.values[0]!;
            state.dc = dc;
            delete state.world;
            mem.set(id, state);
            const worlds = await getWorldNamesByDC(dc);
            const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(PREFIX + 'world')
                .setPlaceholder('Welt wählen')
                .addOptions(worlds.map(w => new StringSelectMenuOptionBuilder().setLabel(w).setValue(w)))
                .setMinValues(1)
                .setMaxValues(1)
            );
            const rows: any[] = [...interaction.message.components];
            rows[0] = worldRow;
            await interaction.update({ components: rows });
          }
          break;
        case 'world':
          if (interaction.isStringSelectMenu()) {
            state.world = interaction.values[0]!;
            mem.set(id, state);
            await interaction.deferUpdate();
          }
          break;
        case 'district':
          if (interaction.isStringSelectMenu()) {
            state.districts = interaction.values;
            mem.set(id, state);
            await interaction.deferUpdate();
          }
          break;
        case 'fc':
          if (interaction.isStringSelectMenu()) {
            state.fc = interaction.values[0]! as any;
            mem.set(id, state);
            await interaction.deferUpdate();
          }
          break;
        case 'size':
          if (interaction.isStringSelectMenu()) {
            state.size = interaction.values[0]! as any;
            mem.set(id, state);
            await interaction.deferUpdate();
          }
          break;
        case 'go':
          if (interaction.isButton()) {
            await interaction.deferReply();
            const { dc, world, districts, fc, size } = state;
            if (!dc || !world) {
              await interaction.editReply({ content: 'Bitte Datacenter und Welt wählen.' });
              break;
            }
            const provider = new PaissaProvider();
            let plots = await provider.fetchFreePlots(dc, world, districts);
            if (fc === 'true') plots = plots.filter(p => p.fcOnly);
            if (fc === 'false') plots = plots.filter(p => !p.fcOnly);
            if (size && size !== 'any') plots = plots.filter(p => p.size === size);
            if (plots.length === 0) {
              await interaction.editReply({ content: 'Keine freien Grundstücke gefunden.' });
              break;
            }
            await interaction.editReply({ content: `Gefundene Grundstücke: ${plots.length}` });
            for (const p of plots.slice(0, 10)) {
              await interaction.followUp({ embeds: [plotEmbed(p)] });
            }
          }
          break;
        default:
          break;
      }
    } catch (err) {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction
            .followUp({ content: 'Fehler bei der Recherche.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        } else {
          await interaction
            .reply({ content: 'Fehler bei der Recherche.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
      }
    }
  });
}

export default { register };
