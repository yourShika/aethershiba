import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { Command } from '../../handlers/commandHandler.js';
import { getGuildFeatures, updateGuildFeatures } from '../../functions/features/featureStore.js';
import { saucerEmbed } from '../../embeds/featureEmbeds.js';

const FASHION_REPORT_URL = 'https://www.reddit.com/r/ffxiv/search/?q=fashion%20report&restrict_sr=1&sort=new';

function nextGateWindow(now = new Date()) {
  const minutes = now.getUTCMinutes();
  const nextSlot = minutes < 20 ? 20 : minutes < 40 ? 40 : 60;
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  if (nextSlot === 60) {
    next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  } else {
    next.setUTCMinutes(nextSlot, 0, 0);
  }
  return next;
}

const data = new SlashCommandBuilder()
  .setName('saucer')
  .setDescription('Gold Saucer events and Fashion Report reminders')
  .addSubcommand(sub =>
    sub
      .setName('configure')
      .setDescription('Configure Gold Saucer reminder posts')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Reminder channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addBooleanOption(opt => opt.setName('fashion_report').setDescription('Enable weekly Fashion Report reminder').setRequired(true))
      .addBooleanOption(opt => opt.setName('gate').setDescription('Enable GATE reminder helper').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Optional role to mention')),
  )
  .addSubcommand(sub => sub.setName('status').setDescription('Show Gold Saucer settings'))
  .addSubcommand(sub => sub.setName('next-gate').setDescription('Show the next GATE time window'))
  .addSubcommand(sub => sub.setName('fashion-report').setDescription('Post a Fashion Report guide link'));

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'next-gate') {
    const next = nextGateWindow();
    await interaction.reply({
      embeds: [
        saucerEmbed(
          'Next GATE Window',
          `The next regular GATE window starts around <t:${Math.floor(next.getTime() / 1000)}:t> (<t:${Math.floor(next.getTime() / 1000)}:R>).`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'fashion-report') {
    await interaction.reply({
      embeds: [
        saucerEmbed(
          'Fashion Report Guide Search',
          'Community guides are usually posted weekly. Use the linked search and verify the current week before spending dyes.',
          FASHION_REPORT_URL,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({ content: 'Gold Saucer reminders are guild-only.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'configure') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role');
    const fashionReportReminder = interaction.options.getBoolean('fashion_report', true);
    const gateReminder = interaction.options.getBoolean('gate', true);

    await updateGuildFeatures(interaction.guildId, (state) => {
      state.saucer = {
        channelId: channel.id,
        fashionReportReminder,
        gateReminder,
        ...(role ? { roleId: role.id } : {}),
        ...(state.saucer?.lastFashionKey ? { lastFashionKey: state.saucer.lastFashionKey } : {}),
      };
      return state;
    });

    await interaction.reply({
      content: `Gold Saucer reminders updated for <#${channel.id}>${role ? ` with ${role.toString()}` : ''}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'status') {
    const config = (await getGuildFeatures(interaction.guildId)).saucer;
    const content = config
      ? [
          `Channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}`,
          `Fashion Report: ${config.fashionReportReminder ? 'on' : 'off'}`,
          `GATE helper: ${config.gateReminder ? 'on' : 'off'}`,
          `Role: ${config.roleId ? `<@&${config.roleId}>` : 'none'}`,
        ].join('\n')
      : 'Gold Saucer reminders are not configured.';
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

export default { data, execute, emoji: '🎰' } satisfies Command;
