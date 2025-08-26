
import {
    MessageFlags,
    SlashCommandSubcommandBuilder,
    type ChatInputCommandInteraction,
    ChannelType,
} from 'discord.js';
import { configManager, ConfigManager } from '../../handlers/configHandler';
import * as seen from '../../functions/housing/housingSaveConfig';
import { runHousingCheckt } from '../../functions/housing/housingRunner';

const builder = new SlashCommandSubcommandBuilder()
    .setName('refresh')
    .setDescription('Löscht Bot-Posts im konfigurierten Channel und postet frisch');

export default {
    name: builder.name,
    description: builder.description,
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.options.getSubcommand(true) !== builder.name) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const gid = interaction.guildId!;
        const config = await configManager.get(gid);
        const h = (config['housing'] as any) ?? {};
        if (!h?.channelId) {
            await interaction.editReply({ content: 'Kein Zielkanal in `/config housing` gesetzt.'});
            return;
        }

        const channel = await interaction.client.channels.fetch(h.channelId).catch(() => null);
        if (channel && channel.type === ChannelType.GuildText) {
            const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (messages) {
                const botMessages = messages.filter(m => m.author?.id === interaction.client.user?.id);
                await channel.bulkDelete(botMessages, true).catch(() => {});
            }
        }

        await seen.cleanup(gid, 0);

        const sent = await runHousingCheckt(interaction.client, gid, { ignoreSeen: true });
        await interaction.editReply({ content: `Channel aktualisiert - ${sent} Meldung(en).`});
    },
};
