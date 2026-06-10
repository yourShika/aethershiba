import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { Command } from '../../handlers/commandHandler.js';
import { getGuildFeatures, updateGuildFeatures } from '../../functions/features/featureStore.js';
import { resetReminderEmbed } from '../../embeds/featureEmbeds.js';

const data = new SlashCommandBuilder()
  .setName('resets')
  .setDescription('Daily and weekly FFXIV reset reminders')
  .addSubcommand(sub =>
    sub
      .setName('configure')
      .setDescription('Configure reset reminder posts')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Reminder channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addBooleanOption(opt => opt.setName('daily').setDescription('Enable daily reset reminders').setRequired(true))
      .addBooleanOption(opt => opt.setName('weekly').setDescription('Enable weekly reset reminders').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Optional role to mention')),
  )
  .addSubcommand(sub => sub.setName('status').setDescription('Show current reset reminder settings'))
  .addSubcommand(sub =>
    sub
      .setName('preview')
      .setDescription('Preview a reset reminder embed')
      .addStringOption(opt =>
        opt
          .setName('kind')
          .setDescription('Reset type')
          .setRequired(true)
          .addChoices(
            { name: 'daily', value: 'daily' },
            { name: 'weekly', value: 'weekly' },
          ),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (!interaction.guildId) {
    await interaction.reply({ content: 'Reset reminders are guild-only.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'configure') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role');
    const daily = interaction.options.getBoolean('daily', true);
    const weekly = interaction.options.getBoolean('weekly', true);

    await updateGuildFeatures(interaction.guildId, (state) => {
      state.resets = {
        channelId: channel.id,
        daily,
        weekly,
        ...(role ? { roleId: role.id } : {}),
        ...(state.resets?.lastDailyKey ? { lastDailyKey: state.resets.lastDailyKey } : {}),
        ...(state.resets?.lastWeeklyKey ? { lastWeeklyKey: state.resets.lastWeeklyKey } : {}),
      };
      return state;
    });

    await interaction.reply({
      content: `Reset reminders updated for <#${channel.id}>${role ? ` with ${role.toString()}` : ''}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'status') {
    const config = (await getGuildFeatures(interaction.guildId)).resets;
    const content = config
      ? [
          `Channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}`,
          `Daily: ${config.daily ? 'on' : 'off'}`,
          `Weekly: ${config.weekly ? 'on' : 'off'}`,
          `Role: ${config.roleId ? `<@&${config.roleId}>` : 'none'}`,
        ].join('\n')
      : 'Reset reminders are not configured.';

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'preview') {
    const kind = interaction.options.getString('kind', true) as 'daily' | 'weekly';
    await interaction.reply({ embeds: [resetReminderEmbed(kind)], flags: MessageFlags.Ephemeral });
  }
}

export default { data, execute, emoji: '📆' } satisfies Command;
