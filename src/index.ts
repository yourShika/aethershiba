// Entry point for the Discord bot. Sets up the client,
// loads configuration and registers all slash commands.
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from './lib/logger.js';
import { configManager } from './lib/config/configHandler.js';
import { commands } from './lib/command/commandInit.js';

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

// When the client becomes ready we load configuration schemas,
// preload config for all guilds and register slash commands.
client.once('ready', async () => {
    logger.info(`✅ Logged in as ${client.user?.tag}`);
    await configManager.loadSchemas();
    for (const guild of client.guilds.cache.values()) {
        await configManager.get(guild.id);
    }
    await client.application?.commands.set(commands.map((c) => c.data.toJSON()));
    logger.info('✅ Slash commands registered');
});

// Listen for incoming slash command interactions and
// dispatch them to the appropriate command handler.
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        logger.error('❌ Error executing command:', error);
        const reply = { content: 'Es ist ein Fehler aufgetreten.', ephemeral: true } as const;
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    }
});

// Finally log in using the provided token. Any login failure is fatal.
client.login(token).catch((e) => {
    logger.error('❌ Login failed:', e);
    process.exit(1);
});
