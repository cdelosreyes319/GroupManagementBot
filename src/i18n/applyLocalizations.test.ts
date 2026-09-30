import { describe, test, expect } from "vitest";
import { SlashCommandBuilder } from "discord.js";
import { applyLocalizations } from "./applyLocalizations";

describe("applyLocalizations", () => {
  test("sets zh-CN description localizations on the command and its options", () => {
    // Build a command matching the real /rank shape (name + group option).
    const builder = new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Set a member's rank.")
      .addStringOption((o) => o.setName("group").setDescription("Which group.").setRequired(true));

    applyLocalizations(builder, "rank");
    const json = builder.toJSON() as {
      description_localizations?: Record<string, string>;
      options?: { name: string; description_localizations?: Record<string, string> }[];
    };

    // Command description is localized.
    expect(json.description_localizations?.["zh-CN"]).toBeTruthy();
    // The `group` option's description is localized.
    const groupOption = json.options?.find((o) => o.name === "group");
    expect(groupOption?.description_localizations?.["zh-CN"]).toBeTruthy();
  });

  test("leaves a command with no translations untouched", () => {
    const builder = new SlashCommandBuilder()
      .setName("unknown-cmd")
      .setDescription("No translations for this one.");
    applyLocalizations(builder, "unknown-cmd");
    const json = builder.toJSON() as { description_localizations?: Record<string, string> | null };
    // No translations -> Discord uses the English default.
    expect(json.description_localizations ?? null).toBeNull();
  });
});
