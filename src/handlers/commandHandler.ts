import type { Client, Interaction, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../lib/logger';

/**
 * Represents a generic command that can be registered with the bot.
 * For now only slash commands are supported, but the handler is designed
 * so that additional interaction types can be added later.
 */
export interface Command {
    /** Builder describing the slash command and its options. */
    data: SlashCommandBuilder;
    /** Function executed when the command is invoked. */
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Central command handler responsible for registering commands and
 * dispatching incoming interactions to the correct implementation.
 */
export class CommandHandler {
    private commands = new Map<string, Command>();

    /**
     * Registers a command with the handler so it can be executed and deployed.
     */
    register(command: Command) {
        this.commands.set(command.data.name, command);
    }

    /**
     * Registers multiple commands at once.
     */
    registerAll(cmds: Command[]) {
        for (const c of cmds) this.register(c);
    }

    /**
     * Deploys all registered slash commands to Discord.
     */
    async deploy(client: Client) {
        await client.application?.commands.set(
            [...this.commands.values()].map((c) => c.data.toJSON())
        );
    }

    /**
     * Handles an interaction by resolving the responsible command and
     * executing it. Unknown interactions are ignored.
     */
    async handle(interaction: Interaction) {
        if (!interaction.isChatInputCommand()) return;
        const command = this.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
    }
}

/**
 * Singleton instance used across the application.
 */
export const commandHandler = new CommandHandler();

