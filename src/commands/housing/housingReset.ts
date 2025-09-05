import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { threadManager, ThreadManager } from "../../lib/threadManager";
import { logger } from "../../lib/logger";

export default {
    name: 'reset',
    description: 'Delete all housing messages and threads fro this guild',
    async execute(interaction: ChatInputCommandInteraction) {
        const guildID = interaction.guildId;
        if (!guildID) {
            await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (
            threadManager.isLocked('housing:setup', { guildId: guildID}) ||
            threadManager.isLocked('housing:refresh', { guildId: guildID}) ||
            threadManager.isLocked('housing:reset', { guildId: guildID}) 
        ) {
            await interaction.reply({ content: 'Another housing task is currently running. Please try again later.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await threadManager.run(
            'housing:reset',
            async () => {
                const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');
                let store: Record<string, { channelId: string; threads: Record<string, string>; messages: Record<string, { threadId: string; messageId: string}> }> = {};
                try {
                    const raw = await readFile(filePath, 'utf8');
                    store = JSON.parse(raw);
                } catch {
                    store = {};
                }

                const rec = store[guildID];
                if (!rec) {
                    await interaction.editReply({ content: 'No housing messages found for this guild.' });
                    return;
                }

                for (const info of Object.values(rec.messages)) {
                    const thread = await interaction.client.channels.fetch(info.threadId).catch(() => null);
                    if (thread && 'isTextBased' in thread && (thread as any).isTextBased()) {
                        await (thread as any).messages.delete(info.messageId).catch(() => null);
                    }
                }

                for (const threadId of Object.values(rec.threads)) {
                    const thread = await interaction.client.channels.fetch(threadId).catch(() => null)
                    await (thread as any)?.delete?.().catch(() => null);
                }

                delete store[guildID];
                try {
                    await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
                } catch (error) {
                    logger.error(`[🏠Housing][${guildID}] Fehler beim Schreiben von ${filePath}: ${String(error)}`);
                }

                await interaction.editReply({ content: 'Housing data reset.' });
            },
            { guildId: guildID, blockWith: ['housing:setup', 'housing:refresh'] }
        );
    },
};
