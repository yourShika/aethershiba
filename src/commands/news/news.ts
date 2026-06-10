import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { Command } from '../../handlers/commandHandler.js';
import { newsEmbed } from '../../embeds/featureEmbeds.js';
import { getGuildFeatures, updateGuildFeatures } from '../../functions/features/featureStore.js';
import { fetchNews, type NewsCategory } from '../../functions/features/newsProvider.js';

const CATEGORIES = [
  { name: 'topics', value: 'topics' },
  { name: 'notices', value: 'notices' },
  { name: 'maintenance', value: 'maintenance' },
  { name: 'updates', value: 'updates' },
  { name: 'news', value: 'news' },
] as const;

const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('Official Lodestone news, maintenance and notices')
  .addSubcommand(sub =>
    sub
      .setName('latest')
      .setDescription('Show latest Lodestone items')
      .addStringOption(opt =>
        opt
          .setName('category')
          .setDescription('Feed category')
          .setRequired(true)
          .addChoices(...CATEGORIES),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('subscribe')
      .setDescription('Post new official Lodestone items into a channel')
      .addStringOption(opt =>
        opt
          .setName('category')
          .setDescription('Feed category')
          .setRequired(true)
          .addChoices(...CATEGORIES),
      )
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Target channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addRoleOption(opt => opt.setName('role').setDescription('Optional role mention')),
  )
  .addSubcommand(sub => sub.setName('status').setDescription('Show news subscription settings'));

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'latest') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const category = interaction.options.getString('category', true) as NewsCategory;
    const items = await fetchNews(category, 5);
    if (!items.length) {
      await interaction.editReply('No Lodestone items were returned for that category.');
      return;
    }
    await interaction.editReply({ embeds: items.map(item => newsEmbed(item)).slice(0, 5) });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({ content: 'News subscriptions are guild-only.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'subscribe') {
    const category = interaction.options.getString('category', true) as NewsCategory;
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role');

    await updateGuildFeatures(interaction.guildId, (state) => {
      state.news = {
        category,
        channelId: channel.id,
        seenLinks: state.news?.seenLinks ?? [],
        ...(role ? { roleId: role.id } : {}),
      };
      return state;
    });

    await interaction.reply({
      content: `Official Lodestone **${category}** posts will be sent to <#${channel.id}>${role ? ` with ${role.toString()}` : ''}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'status') {
    const config = (await getGuildFeatures(interaction.guildId)).news;
    const content = config
      ? [
          `Category: ${config.category}`,
          `Channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}`,
          `Role: ${config.roleId ? `<@&${config.roleId}>` : 'none'}`,
          `Seen items: ${config.seenLinks.length}`,
        ].join('\n')
      : 'News subscription is not configured.';
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

export default { data, execute, emoji: '📰' } satisfies Command;
