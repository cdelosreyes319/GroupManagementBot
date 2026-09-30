// commands/index.ts
// The command registries. `commands` holds slash commands; `userContextMenus`
// holds right-click "app" commands. Both main.ts and deploy-commands.ts read
// from here.
import * as ping from "./ping";
import * as accept from "./acceptuser";
import * as permissions from "./permissions";
import * as whois from "./whois";
import * as rank from "./rankuser";
import * as eventdm from "./eventdm";
import * as eventdmExclusions from "./eventdmexclusions";
import * as statsSource from "./statssource";
import * as statsAlias from "./statsalias";
import * as userinfo from "./userinfo";
import * as robloxInfo from "./robloxinfo";
import type { BotCommand, UserContextMenuCommand } from "./types";

// Slash commands, keyed by command name.
export const commands: Record<string, BotCommand> = {
  ping,
  accept,
  permissions,
  whois,
  rank,
  eventdm,
  "eventdm-exclusions": eventdmExclusions,
  "stats-source": statsSource,
  "stats-alias": statsAlias,
  userinfo,
};

// User context-menu commands, keyed by command name.
export const userContextMenus: Record<string, UserContextMenuCommand> = {
  "Roblox Info": robloxInfo,
};
