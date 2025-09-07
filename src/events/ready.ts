// events/ready.ts

import { Events, Client } from 'discord.js';
import { logger } from '../lib/logger.js';
import { configManager } from '../handlers/configHandler.js';
import { commandHandler } from '../handlers/commandHandler.js';

/**
 * Registers the "ready" event handler.
 * 
 * This event is fired once after the bot successfully logs in.
 * On ready, we:
 *  - Log the bot identity.
 *  - Load configuration schemas (so configManager knows how to validate data).
 *  - Warm up guild configs into the cache by reading them from disk.
 *  - Deploy (refresh) slash commands with Discord so the UI is up to date.
 *  - Log success messages.
 */
export function register(client: Client) {
    client.once(Events.ClientReady, async () => {
        logger.info(`✅ Logged in as ${client.user?.tag}`);

        // Load all config schemas from schema directory
        await configManager.loadSchemas();

        // Warm up each guild config into memory cache
        for (const guild of client.guilds.cache.values()) {
            await configManager.get(guild.id);
        }

        // Refresh slash commands on every startup
        // This ensures Discord always has the latest definitions
        await commandHandler.deploy(client);
        logger.info('✅ Commands registered (refreshed)');
    });
}

// Default export allows dynamic registration by event loader
export default { register };
