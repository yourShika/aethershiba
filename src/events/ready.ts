import { Events, Client } from 'discord.js';
import { logger } from '../lib/logger.js';
import { configManager } from '../lib/config/configHandler.js';
import { commandHandler } from '../lib/command/commandHandler.js';

/**
 * Registers the ready event which loads configuration and deploys commands
 * once the bot successfully logs in.
 */
export function register(client: Client) {
    client.once(Events.ClientReady, async () => {
        logger.info(`✅ Logged in as ${client.user?.tag}`);
        await configManager.loadSchemas();
        for (const guild of client.guilds.cache.values()) {
            await configManager.get(guild.id);
        }
        await commandHandler.deploy(client);
        logger.info('✅ Commands registered');
    });
}

export default { register };
