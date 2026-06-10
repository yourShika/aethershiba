import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { Command } from '../../handlers/commandHandler.js';
import { getGuildFeatures, updateGuildFeatures } from '../../functions/features/featureStore.js';
import { huntReportEmbed } from '../../embeds/featureEmbeds.js';

const data = new SlashCommandBuilder()
  .setName('hunt')
  .setDescription('Hunt notifications and player reports')
  .addSubcommand(sub =>
    sub
      .setName('subscribe')
      .setDescription('Configure hunt report notifications')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Target channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption(opt =>
        opt
          .setName('ranks')
          .setDescription('Comma-separated ranks, e.g. S,A')
          .setRequired(true),
      )
      .addRoleOption(opt => opt.setName('role').setDescription('Optional role mention')),
  )
  .addSubcommand(sub =>
    sub
      .setName('report')
      .setDescription('Post a hunt report')
      .addStringOption(opt => opt.setName('rank').setDescription('Rank, e.g. S or A').setRequired(true))
      .addStringOption(opt => opt.setName('world').setDescription('World').setRequired(true))
      .addStringOption(opt => opt.setName('zone').setDescription('Zone or map area').setRequired(true))
      .addStringOption(opt => opt.setName('notes').setDescription('Optional coordinates, instance or pull time')),
  )
  .addSubcommand(sub => sub.setName('status').setDescription('Show hunt notification settings'));

function normalizeRanks(input: string) {
  return Array.from(new Set(input.split(',').map(rank => rank.trim().toUpperCase()).filter(Boolean))).slice(0, 10);
}

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (!interaction.guildId) {
    await interaction.reply({ content: 'Hunt notifications are guild-only.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'subscribe') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role');
    const ranks = normalizeRanks(interaction.options.getString('ranks', true));

    await updateGuildFeatures(interaction.guildId, (state) => {
      state.hunt = {
        channelId: channel.id,
        ranks,
        ...(role ? { roleId: role.id } : {}),
      };
      return state;
    });

    await interaction.reply({
      content: `Hunt reports for **${ranks.join(', ') || 'all ranks'}** will post in <#${channel.id}>${role ? ` with ${role.toString()}` : ''}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'status') {
    const config = (await getGuildFeatures(interaction.guildId)).hunt;
    const content = config
      ? [
          `Channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}`,
          `Ranks: ${config.ranks.join(', ') || 'all'}`,
          `Role: ${config.roleId ? `<@&${config.roleId}>` : 'none'}`,
        ].join('\n')
      : 'Hunt notifications are not configured.';
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'report') {
    const config = (await getGuildFeatures(interaction.guildId)).hunt;
    const rank = interaction.options.getString('rank', true).trim().toUpperCase();
    const world = interaction.options.getString('world', true);
    const zone = interaction.options.getString('zone', true);
    const notes = interaction.options.getString('notes') ?? undefined;

    const targetChannelId = config?.channelId ?? interaction.channelId;
    const targetChannel = targetChannelId
      ? await interaction.client.channels.fetch(targetChannelId).catch(() => null)
      : null;

    if (!targetChannel || !('isTextBased' in targetChannel) || !targetChannel.isTextBased()) {
      await interaction.reply({ content: 'No valid hunt report channel is available.', flags: MessageFlags.Ephemeral });
      return;
    }

    const shouldMention = !config?.ranks?.length || config.ranks.includes(rank);
    const content = shouldMention && config?.roleId ? `<@&${config.roleId}>` : undefined;
    await (targetChannel as { send: (options: unknown) => Promise<unknown> }).send({
      content,
      embeds: [huntReportEmbed(rank, world, zone, notes, interaction.user.tag)],
    });

    await interaction.reply({ content: `Hunt report posted in <#${targetChannelId}>.`, flags: MessageFlags.Ephemeral });
  }
}

export default { data, execute, emoji: '🐉' } satisfies Command;
