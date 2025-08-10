// Shared command types for slash command implementations.
import type { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

// Structure that every command module must expose.
export interface Command {
    // Builder describing the slash command and its options.
    data: SlashCommandBuilder;
    // Function executed when the command is invoked.
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

