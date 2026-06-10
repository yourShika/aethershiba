import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { EVENT_PREFIX } from '../../const/constants.js';
import type { Command } from '../../handlers/commandHandler.js';
import { communityEventEmbed } from '../../embeds/featureEmbeds.js';
import { createId, getGuildFeatures, updateGuildFeatures, type CommunityEvent } from '../../functions/features/featureStore.js';

function eventButtons(eventId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${EVENT_PREFIX}join:${eventId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${EVENT_PREFIX}maybe:${eventId}`)
      .setLabel('Maybe')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${EVENT_PREFIX}leave:${eventId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

const data = new SlashCommandBuilder()
  .setName('events')
  .setDescription('Plan raids, treasure maps and community events')
  .addSubcommand(sub =>
    sub
      .setName('create')
      .setDescription('Create an event post with signup buttons')
      .addStringOption(opt => opt.setName('title').setDescription('Event title').setRequired(true))
      .addIntegerOption(opt => opt.setName('unix_time').setDescription('Start time as Unix timestamp').setMinValue(1).setRequired(true))
      .addStringOption(opt =>
        opt
          .setName('type')
          .setDescription('Event type')
          .setRequired(true)
          .addChoices(
            { name: 'raid', value: 'raid' },
            { name: 'treasure maps', value: 'treasure' },
            { name: 'social', value: 'social' },
            { name: 'other', value: 'other' },
          ),
      )
      .addStringOption(opt => opt.setName('description').setDescription('Short description'))
      .addStringOption(opt => opt.setName('guide_url').setDescription('Guide or strategy URL'))
      .addStringOption(opt => opt.setName('image_url').setDescription('Optional image URL'))
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Target channel, defaults to current channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
  )
  .addSubcommand(sub => sub.setName('list').setDescription('List open events'))
  .addSubcommand(sub =>
    sub
      .setName('cancel')
      .setDescription('Cancel an event')
      .addStringOption(opt => opt.setName('id').setDescription('Event ID').setRequired(true)),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (!interaction.guildId) {
    await interaction.reply({ content: 'Events are guild-only.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'create') {
    const target = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!target || !('isTextBased' in target) || !target.isTextBased()) {
      await interaction.reply({ content: 'No valid target channel is available.', flags: MessageFlags.Ephemeral });
      return;
    }

    const event: CommunityEvent = {
      id: createId('evt'),
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      channelId: target.id,
      title: interaction.options.getString('title', true),
      startsAt: interaction.options.getInteger('unix_time', true) * 1000,
      type: interaction.options.getString('type', true) as CommunityEvent['type'],
      attendees: [],
      maybes: [],
      status: 'open',
      createdAt: Date.now(),
      ...(interaction.options.getString('description') ? { description: interaction.options.getString('description')! } : {}),
      ...(interaction.options.getString('guide_url') ? { guideUrl: interaction.options.getString('guide_url')! } : {}),
      ...(interaction.options.getString('image_url') ? { imageUrl: interaction.options.getString('image_url')! } : {}),
    };

    const sent = await (target as { send: (options: unknown) => Promise<{ id: string }> }).send({
      embeds: [communityEventEmbed(event)],
      components: [eventButtons(event.id)],
    });

    event.messageId = sent.id;
    await updateGuildFeatures(interaction.guildId, (state) => {
      state.events = [...(state.events ?? []), event];
      return state;
    });

    await interaction.reply({ content: `Event \`${event.id}\` created in <#${target.id}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'list') {
    const events = ((await getGuildFeatures(interaction.guildId)).events ?? [])
      .filter(event => event.status === 'open')
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 15);

    const content = events.length
      ? events.map(event => `\`${event.id}\` • **${event.title}** • <t:${Math.floor(event.startsAt / 1000)}:F> • ${event.attendees.length} going`).join('\n')
      : 'No open events.';
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'cancel') {
    const id = interaction.options.getString('id', true);
    let eventToEdit: CommunityEvent | undefined;
    await updateGuildFeatures(interaction.guildId, (state) => {
      state.events = (state.events ?? []).map((event) => {
        if (event.id !== id) return event;
        eventToEdit = { ...event, status: 'cancelled' };
        return eventToEdit;
      });
      return state;
    });

    if (!eventToEdit) {
      await interaction.reply({ content: `No event found for \`${id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = await interaction.client.channels.fetch(eventToEdit.channelId).catch(() => null);
    if (channel && 'isTextBased' in channel && channel.isTextBased() && eventToEdit.messageId) {
      const message = await (channel as { messages: { fetch: (id: string) => Promise<{ edit: (options: unknown) => Promise<unknown> }> } }).messages.fetch(eventToEdit.messageId).catch(() => null);
      await message?.edit({ embeds: [communityEventEmbed(eventToEdit)], components: [eventButtons(eventToEdit.id, true)] }).catch(() => null);
    }

    await interaction.reply({ content: `Event \`${id}\` cancelled.`, flags: MessageFlags.Ephemeral });
  }
}

export { eventButtons };
export default { data, execute, emoji: '🗓️' } satisfies Command;
