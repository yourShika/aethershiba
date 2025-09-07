// handlers/commandHandler.ts

import type {
  Client,
  Interaction,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';

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

    /** Optional handler for autocomplete interactions. */
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;

    /** Optional emoji shown in help listings. */
    emoji?: string;
}

/**
 * Central command handler responsible for:
 *  - Registering commands (individually or in bulk).
 *  - Deploying slash commands to Discord.
 *  - Handling incoming interactions and routing them to the correct command.
 */
export class CommandHandler {
    // Registry of commands by name
    private commands = new Map<string, Command>();

    //Registers a command with the handler so it can be executed and deployed.
    register(command: Command) {
        this.commands.set(command.data.name, command);
    }

    //Registers multiple commands at once.
    registerAll(cmds: Command[]) {
        for (const c of cmds) this.register(c);
    }

    /**
     * Deploys all registered slash commands to Discord.
     * This updates the global application commands.
     */
    async deploy(client: Client) {
        await client.application?.commands.set(
            [...this.commands.values()].map((c) => c.data.toJSON())
        );
    }

    /**
     * Handle an interaction from Discord:
     *  - If it's a slash command, find the command and run its execute() method.
     *  - If it's an autocomplete event, run its autocomplete() handler (if provided).
     *  - If no command is found, ignore the interaction
     */
    async handle(interaction: Interaction) {
        if (interaction.isChatInputCommand()) {
            const command = this.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = this.commands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;
            await command.autocomplete(interaction);
        }
    }
}

/**
 * Singleton instance used across the application.
 * Import this instead of creating new instances,
 * so commands are registered consistently.
 */
export const commandHandler = new CommandHandler();

