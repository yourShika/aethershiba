// events/index.ts

import type { Client } from 'discord.js';
import * as ready from './ready.js';
import * as housingInteraction from './housing/housingInteraction.js';
import * as interactionCreate from './interactionCreate.js';

/**
 * Register all event handlers for the bot.
 *
 * Each event module exports a `register(client)` function,
 * which attaches one or more listeners to the Discord client.
 *
 * - ready.ts:        Handles bot startup (config load + command deployment).
 * - housingInteraction.ts: Handles housing-related custom interactions (buttons, menus).
 * - interactionCreate.ts: Main router for slash commands, autocomplete, and UI interactions.
 *
 * By centralizing registration here, the bot’s entrypoint (index.ts)
 * can just call `registerEvents(client)` instead of wiring events manually.
 */
export function registerEvents(client: Client) {

    // Fired once after the bot successfully logs in
    ready.register(client);

    // Handles housing-specific UI interactions (customId starting with HOUSING_PREFIX)
    housingInteraction.register(client);
    
    // Handles all other interactions: slash commands, autocomplete, unhandled UI components
    interactionCreate.register(client);
}

/** Default export for compatibility with dynamic loaders. */
export default { registerEvents };
