import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from './lib/logger.js';
import { configManager } from './lib/config/index.js';
import { commands } from './commands/index.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ Missing DISCORD_TOKEN in .env');
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
    logger.info(`✅ Logged in as ${client.user?.tag}`);
    await configManager.loadSchemas();
    for (const guild of client.guilds.cache.values()) {
        await configManager.get(guild.id);
    }
    await client.application?.commands.set(commands.map((c) => c.data.toJSON()));
    logger.info('✅ Slash commands registered');
});

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

client.login(token).catch((e) => {
    logger.error('❌ Login failed:', e);
    process.exit(1);
});
