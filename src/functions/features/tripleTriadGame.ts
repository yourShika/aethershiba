import { Colors, EmbedBuilder } from 'discord.js';

import { createId } from './featureStore.js';

type TriadCard = {
  name: string;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TriadSession = {
  id: string;
  ownerId: string;
  playerScore: number;
  botScore: number;
  round: number;
  maxRounds: number;
  lastRound?: string;
  done: boolean;
  createdAt: number;
};

const DECK: TriadCard[] = [
  { name: 'Alpha Wolf', top: 4, right: 3, bottom: 2, left: 5 },
  { name: 'Bomb', top: 2, right: 6, bottom: 3, left: 2 },
  { name: 'Cactuar', top: 5, right: 2, bottom: 5, left: 1 },
  { name: 'Coeurl', top: 3, right: 5, bottom: 4, left: 4 },
  { name: 'Mandragora', top: 2, right: 4, bottom: 6, left: 3 },
  { name: 'Morbol', top: 6, right: 3, bottom: 5, left: 2 },
  { name: 'Tonberry', top: 3, right: 7, bottom: 2, left: 4 },
  { name: 'Zu', top: 7, right: 2, bottom: 4, left: 3 },
];

const sessions = new Map<string, TriadSession>();

function cardPower(card: TriadCard) {
  return card.top + card.right + card.bottom + card.left;
}

function drawCard() {
  return DECK[Math.floor(Math.random() * DECK.length)]!;
}

export function startTriadSession(ownerId: string) {
  const session: TriadSession = {
    id: createId('triad'),
    ownerId,
    playerScore: 0,
    botScore: 0,
    round: 0,
    maxRounds: 5,
    done: false,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getTriadSession(id: string) {
  return sessions.get(id);
}

export function playTriadRound(id: string, userId: string): TriadSession | null {
  const session = sessions.get(id);
  if (!session || session.ownerId !== userId || session.done) return null;

  const player = drawCard();
  const bot = drawCard();
  const playerPower = cardPower(player);
  const botPower = cardPower(bot);

  if (playerPower > botPower) session.playerScore += 1;
  if (botPower > playerPower) session.botScore += 1;
  session.round += 1;
  session.lastRound = `You drew **${player.name}** (${playerPower}) • AetherShiba drew **${bot.name}** (${botPower})`;
  session.done = session.round >= session.maxRounds;
  return session;
}

export function stopTriadSession(id: string, userId: string): TriadSession | null {
  const session = sessions.get(id);
  if (!session || session.ownerId !== userId) return null;
  session.done = true;
  return session;
}

export function triadEmbed(session: TriadSession) {
  const result = session.done
    ? session.playerScore === session.botScore
      ? 'Draw game.'
      : session.playerScore > session.botScore
        ? 'You win.'
        : 'AetherShiba wins.'
    : 'Press Draw to play the next card.';

  return new EmbedBuilder()
    .setColor(session.done ? Colors.Gold : Colors.Blurple)
    .setTitle('Triple Triad Mini Match')
    .setDescription(result)
    .addFields(
      { name: 'Round', value: `${session.round}/${session.maxRounds}`, inline: true },
      { name: 'You', value: String(session.playerScore), inline: true },
      { name: 'AetherShiba', value: String(session.botScore), inline: true },
      { name: 'Last Draw', value: session.lastRound ?? 'No cards drawn yet.', inline: false },
    )
    .setFooter({ text: `Session ID: ${session.id}` })
    .setTimestamp(session.createdAt);
}
