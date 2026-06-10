import { Events, MessageFlags, type Client } from 'discord.js';

import { EVENT_PREFIX, FASHION_PREFIX, TRIAD_PREFIX } from '../const/constants.js';
import { communityEventEmbed, fashionPostEmbed } from '../embeds/featureEmbeds.js';
import { eventButtons } from '../commands/events/events.js';
import { fashionButtons } from '../commands/fashion/fashion.js';
import { triadButtons } from '../commands/tripletriad/tripletriad.js';
import { playTriadRound, stopTriadSession, triadEmbed } from '../functions/features/tripleTriadGame.js';
import { updateGuildFeatures, type CommunityEvent, type FashionPost } from '../functions/features/featureStore.js';
import { logger } from '../lib/logger.js';

function moveUser(event: CommunityEvent, userId: string, target: 'attendees' | 'maybes' | 'none') {
  event.attendees = event.attendees.filter(id => id !== userId);
  event.maybes = event.maybes.filter(id => id !== userId);
  if (target === 'attendees') event.attendees.push(userId);
  if (target === 'maybes') event.maybes.push(userId);
}

function votePost(post: FashionPost, userId: string, vote: 'up' | 'down') {
  post.upvotes = post.upvotes.filter(id => id !== userId);
  post.downvotes = post.downvotes.filter(id => id !== userId);
  if (vote === 'up') post.upvotes.push(userId);
  if (vote === 'down') post.downvotes.push(userId);
}

export function register(client: Client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const id = interaction.customId;
    try {
      if (id.startsWith(EVENT_PREFIX)) {
        if (!interaction.guildId) return;
        const [, action, eventId] = id.split(':');
        if (!eventId || !['join', 'maybe', 'leave'].includes(action ?? '')) return;

        let updated: CommunityEvent | undefined;
        await updateGuildFeatures(interaction.guildId, (state) => {
          state.events = (state.events ?? []).map((event) => {
            if (event.id !== eventId || event.status !== 'open') return event;
            const next = { ...event, attendees: [...event.attendees], maybes: [...event.maybes] };
            moveUser(next, interaction.user.id, action === 'join' ? 'attendees' : action === 'maybe' ? 'maybes' : 'none');
            updated = next;
            return next;
          });
          return state;
        });

        if (!updated) {
          await interaction.reply({ content: 'This event is no longer available.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.update({
          embeds: [communityEventEmbed(updated)],
          components: [eventButtons(updated.id)],
        });
        return;
      }

      if (id.startsWith(FASHION_PREFIX)) {
        if (!interaction.guildId) return;
        const [, action, postId, vote] = id.split(':');
        if (action !== 'vote' || !postId || (vote !== 'up' && vote !== 'down')) return;

        let updated: FashionPost | undefined;
        await updateGuildFeatures(interaction.guildId, (state) => {
          state.fashionPosts = (state.fashionPosts ?? []).map((post) => {
            if (post.id !== postId) return post;
            const next = { ...post, upvotes: [...post.upvotes], downvotes: [...post.downvotes] };
            votePost(next, interaction.user.id, vote);
            updated = next;
            return next;
          });
          return state;
        });

        if (!updated) {
          await interaction.reply({ content: 'This fashion submission is no longer available.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.update({
          embeds: [fashionPostEmbed(updated)],
          components: [fashionButtons(updated.id)],
        });
        return;
      }

      if (id.startsWith(TRIAD_PREFIX)) {
        const [, action, sessionId] = id.split(':');
        if (!sessionId || !['draw', 'stop'].includes(action ?? '')) return;

        const session = action === 'draw'
          ? playTriadRound(sessionId, interaction.user.id)
          : stopTriadSession(sessionId, interaction.user.id);

        if (!session) {
          await interaction.reply({ content: 'This Triple Triad match is not available for you.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.update({
          embeds: [triadEmbed(session)],
          components: [triadButtons(session.id, session.done)],
        });
      }
    } catch (error) {
      logger.error('Community interaction failed', error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'This interaction could not be processed.', flags: MessageFlags.Ephemeral });
      }
    }
  });
}

export default { register };
