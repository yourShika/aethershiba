// commands/housing/housingReset.ts

import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { threadManager } from "../../lib/threadManager";
import { logger } from "../../lib/logger";
import { clearHousingSchedulerState } from "../../functions/housing/housingScheduler.js";
import { clearGuildSchedule } from "../../functions/housing/housingScheduleStore.js";
import { clear as clearSeen } from "../../functions/housing/housingSaveConfig";
import { ANOTHER_HOUSING_TASK_RUNNING, GUILD_ONLY, HOUSING_DATA_RESET, NO_MESSAGE_FOUND } from "../../const/messages";

/**
 * /housing reset
 * 
 * Deletes all tracked housing messages and threads for the current guild.
 * The messages/threads to delete are determined from the persisted
 * `housing_messages.json` store. This command:
 *  - Ensures it runs inside a per-guild lock (no overlapt with setup/refresh/reset)
 *  - Loads the store and finds the current guild's records.
 *  - Deletes each stored message (if the thread is still text-based).
 *  - Deletes each stored thread (if still present).
 *  - Removes the guild entry from the store and writes it back to disk.
 * 
 * Replies are ephemeral so only the command invoker sees the status.
 */
export default {
    name: 'reset',
    description: 'Delete all housing messages and threads fro this guild',

    /**
     * Command handler for /housing reset.
     * 
     * @param interaction - Discord Chat Input Command Interaction
     */
    async execute(interaction: ChatInputCommandInteraction) {
        const guildID = interaction.guildId;

        // This command only makes sense inside a guild.
        if (!guildID) {
            await interaction.reply({ content: `${GUILD_ONLY}`, flags: MessageFlags.Ephemeral });
            return;
        }

        // Avoid running when any housing task is already in progress for this guild.
        if (
            threadManager.isLocked('housing:setup', { guildId: guildID}) ||
            threadManager.isLocked('housing:refresh', { guildId: guildID}) ||
            threadManager.isLocked('housing:reset', { guildId: guildID}) 
        ) {

            await interaction.reply({ 
                content: `${ANOTHER_HOUSING_TASK_RUNNING}`, flags: MessageFlags.Ephemeral 
            });
            return;
        }

        // Acknowledge the command early while we perform deletions.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        /**
         * Run the destructive work under the "housing:reset" lock,
         * and block against setup/refresh to prevent conflicts.
         */
        await threadManager.run(
            'housing:reset',
            async () => {
                // Path to the persistent store that tracks threads/messages by guild.
                const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');

                // Load the store (safe-parse; default to empty).
                let store: Record<string, {
                    channelId: string;
                    threads: Record<string, string>;
                    messages: Record<string, { threadId: string; messageId: string; hash?: string; deleteAt?: number; refreshedAt?: number }>;
                    config?: { dataCenter: string; worlds: string[]; districts: string[] };
                }> = {};
                try {
                    const raw = await readFile(filePath, 'utf8');
                    store = JSON.parse(raw);
                } catch {
                    store = {};
                }

                // Nothing to reset for this guild
                const rec = store[guildID];
                if (!rec) {
                    await interaction.editReply({ content: `${NO_MESSAGE_FOUND}` });
                    return;
                }

                // ---------------------------------------------------
                // Delete each stored message (if still retrievable)
                // ---------------------------------------------------
                for (const info of Object.values(rec.messages)) {
                    const thread = await interaction.client.channels.fetch(info.threadId).catch(() => null);
                    if (thread && 'isTextBased' in thread && (thread as any).isTextBased()) {
                        // Best-effort deletion; ignore failures (message might be gone already).
                        await (thread as any).messages.delete(info.messageId).catch(() => null);
                    }
                }

                // ---------------------------------------------------
                // Delete each stored thread (if still present)
                // ---------------------------------------------------
                for (const threadId of Object.values(rec.threads)) {
                    const thread = await interaction.client.channels.fetch(threadId).catch(() => null)
                    // Use optional chaining; some channel objects may not support delete().
                    await (thread as any)?.delete?.().catch(() => null);
                }

                // ---------------------------------------------------
                // Remove this guild's entry from the store and persist
                // ---------------------------------------------------
                delete store[guildID];
                try {
                    await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
                } catch (error) {
                    logger.error(`[🏠Housing][${guildID}] Fehler beim Schreiben von ${filePath}: ${String(error)}`);
                }

                await Promise.allSettled([
                    clearHousingSchedulerState(guildID),
                    clearGuildSchedule(guildID),
                    clearSeen(guildID),
                ]);

                // Final confirmation to the invoker.
                await interaction.editReply({ content: `${HOUSING_DATA_RESET}` });
            },
            { guildId: guildID, blockWith: ['housing:setup', 'housing:refresh'] }
        );
    },
};
