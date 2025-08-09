import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logger } from './lib/logger';

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('❌ Missing DISCORD_TOKEN in .env');
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
    logger.info(`✅ Logged in as ${client.user?.tag}`);
});

client.login(token).catch((e) => {
    logger.error('❌ Login failed:', e);
    process.exit(1);
});