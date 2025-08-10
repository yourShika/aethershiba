import type { Client } from 'discord.js';
import * as ready from './ready.js';
import * as housingInteraction from './housing/housingInteraction.js';
import * as interactionCreate from './interactionCreate.js';

/**
 * Registers all event handlers for the provided client.
 */
export function registerEvents(client: Client) {
    ready.register(client);
    housingInteraction.register(client);
    interactionCreate.register(client);
}

export default { registerEvents };
