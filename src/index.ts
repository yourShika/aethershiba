// Entry point for the Discord bot. Sets up the client,
// loads configuration and registers all slash commands.
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from './lib/logger.js';
import { commands } from './lib/command/commandInit.js';
import { commandHandler } from './lib/command/commandHandler.js';
import { registerEvents } from './events/index.js';

// Ensure the Discord token is available. Without it the bot cannot start.
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ Missing DISCORD_TOKEN in .env');
    process.exit(1);
}

// Create a new Discord client with guild intent. No other
// intents are required at the moment.
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// Register all commands with the handler so they can be deployed and executed.
commandHandler.registerAll(commands);

// Set up event listeners.
registerEvents(client);

// Finally log in using the provided token. Any login failure is fatal.
client.login(token).catch((e) => {
    logger.error('❌ Login failed:', e);
    process.exit(1);
});
