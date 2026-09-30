// interactions/router.ts
// The single entry point for every Discord interaction. It records activity,
// runs a server-only check, a permission check, dispatches to the right
// handler, and wraps everything in one try/catch that replies with a generic
// ephemeral error. RSVP poll buttons are let through without the server-only
// and permission checks (they arrive in DMs).
import {
  MessageFlags,
  type Interaction,
  type GuildMember,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type RepliableInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AccessLevel } from "../commands/types";
import { commands, userContextMenus } from "../commands/index";
import type { PermissionService } from "../services/permissionService";
import { parseCustomId } from "./customId";
import { MESSAGES } from "../ui/messages";
import type { LogEntry } from "../services/commandLogger";

// A handler for a button or modal interaction, keyed by its custom-ID feature.
// `commandName` ties the handler to a command so the same permission check
// applies; a null commandName means no permission check (RSVP buttons).
export type ComponentHandler = {
  commandName: string | null;
  handleButton?(interaction: ButtonInteraction): Promise<void>;
  handleModal?(interaction: ModalSubmitInteraction): Promise<void>;
};

// Everything the router needs, injected so it stays testable and free of globals.
export type RouterDeps = {
  permissions: PermissionService;
  componentHandlers: Record<string, ComponentHandler>;
  recordActivity?(userId: string): void;
  logCommand?(entry: LogEntry): void;
};

// Option names that must never be logged (they carry secrets).
const SECRET_OPTION_NAMES = new Set(["secret", "url", "token", "key"]);

// The custom-ID feature prefix for RSVP poll buttons, which bypass checks.
const RSVP_FEATURE = "eventdm";
const RSVP_ACTION = "rsvp";

// Builds the interactionCreate handler.
export function createRouter(deps: RouterDeps) {
  return async function handleInteraction(interaction: Interaction): Promise<void> {
    // Record activity for any interaction that happens inside a server.
    if (interaction.inGuild() && deps.recordActivity) {
      deps.recordActivity(interaction.user.id);
    }

    try {
      await dispatch(interaction, deps);
    } catch (error) {
      console.error("Unhandled interaction error:", errorSummary(error));
      await replyError(interaction);
    }
  };
}

// Routes an interaction to the correct handler after the shared checks.
async function dispatch(interaction: Interaction, deps: RouterDeps): Promise<void> {
  // RSVP buttons work in DMs and skip the server-only and permission checks.
  if (interaction.isButton()) {
    const parsed = parseCustomId(interaction.customId);
    if (parsed && parsed.feature === RSVP_FEATURE && parsed.action === RSVP_ACTION) {
      await runComponent(interaction, deps, true);
      return;
    }
  }

  // Everything else must be inside the server.
  if (!interaction.inGuild()) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: MESSAGES.serverOnly, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = commands[interaction.commandName];
    if (!command) {
      return;
    }
    if (!(await checkPermission(interaction, command.access, interaction.commandName, deps))) {
      return;
    }
    await command.execute(interaction);
    logCommandRun(interaction, deps, chatInputOptionSummary(interaction));
    return;
  }

  if (interaction.isUserContextMenuCommand()) {
    const command = userContextMenus[interaction.commandName];
    if (!command) {
      return;
    }
    if (!(await checkPermission(interaction, command.access, interaction.commandName, deps))) {
      return;
    }
    await command.execute(interaction);
    logCommandRun(interaction, deps, [`Target: ${interaction.targetUser.tag} (${interaction.targetUser.id})`]);
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = commands[interaction.commandName];
    if (!command?.autocomplete) {
      return;
    }
    // Return an empty list for members who could not run the command anyway.
    const member = interaction.member as GuildMember | null;
    if (
      member &&
      !deps.permissions.canUseCommand(
        { name: interaction.commandName, access: command.access },
        member,
      )
    ) {
      await interaction.respond([]);
      return;
    }
    await command.autocomplete(interaction);
    return;
  }

  if (interaction.isButton() || interaction.isModalSubmit()) {
    await runComponent(interaction, deps, false);
    return;
  }
}

// Finds and runs a button/modal handler, applying the permission check unless
// the handler is exempt (RSVP buttons).
async function runComponent(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  deps: RouterDeps,
  skipPermission: boolean,
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return;
  }
  const handler = deps.componentHandlers[parsed.feature];
  if (!handler) {
    return;
  }

  if (!skipPermission && handler.commandName) {
    const command = commands[handler.commandName];
    if (command && !(await checkPermission(interaction, command.access, handler.commandName, deps))) {
      return;
    }
  }

  if (interaction.isButton() && handler.handleButton) {
    await handler.handleButton(interaction);
  } else if (interaction.isModalSubmit() && handler.handleModal) {
    await handler.handleModal(interaction);
  }
}

// Checks permission for a command interaction, replying and logging on denial.
async function checkPermission(
  interaction: RepliableInteraction,
  access: AccessLevel,
  commandName: string,
  deps: RouterDeps,
): Promise<boolean> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    return false;
  }
  const allowed = deps.permissions.canUseCommand({ name: commandName, access }, member);

  // Audit line for configurable and admin commands (never any secret).
  if (access !== "public") {
    console.log(
      `[perm] ${new Date().toISOString()} user=${interaction.user.id} command=${commandName} result=${allowed ? "allow" : "deny"}`,
    );
  }

  if (!allowed) {
    await interaction.reply({ content: MESSAGES.noPermission, flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

// Logs a successful command run to the configured channel (fire-and-forget).
function logCommandRun(
  interaction: { commandName: string; user: { id: string }; channelId: string | null },
  deps: RouterDeps,
  detail: string[],
): void {
  if (!deps.logCommand) {
    return;
  }
  deps.logCommand({
    commandName: interaction.commandName,
    runnerId: interaction.user.id,
    channelId: interaction.channelId ?? "unknown",
    detail,
  });
}

// Builds a redacted "name: value" summary of a chat-input command's options,
// skipping any option whose name suggests it carries a secret.
function chatInputOptionSummary(interaction: ChatInputCommandInteraction): string[] {
  const lines: string[] = [];
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  if (group) {
    lines.push(`Group: ${group}`);
  }
  if (sub) {
    lines.push(`Subcommand: ${sub}`);
  }
  // `data` holds the raw option values discord.js parsed for this interaction.
  for (const option of interaction.options.data) {
    collectOptions(option, lines);
  }
  return lines;
}

// Recursively collects option name/value lines, skipping secret-named options
// and options that carry no simple value (subcommands/groups handled above).
function collectOptions(
  option: { name: string; value?: string | number | boolean; options?: readonly unknown[] },
  lines: string[],
): void {
  if (option.options) {
    for (const child of option.options) {
      collectOptions(child as typeof option, lines);
    }
    return;
  }
  if (option.value === undefined) {
    return;
  }
  if (SECRET_OPTION_NAMES.has(option.name.toLowerCase())) {
    lines.push(`${option.name}: (hidden)`);
    return;
  }
  lines.push(`${option.name}: ${String(option.value)}`);
}

// Replies with a generic ephemeral error, using followUp if already replied.
async function replyError(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) {
    return;
  }
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: MESSAGES.genericError, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: MESSAGES.genericError, flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Nothing more we can do if even the error reply fails.
  }
}

// A short, secret-free summary of an error for logging.
function errorSummary(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return "unknown error";
}
