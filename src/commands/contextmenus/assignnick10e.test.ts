//assignnick10e.test.ts
import { describe, test, expect, vi } from "vitest";
import { execute } from "./assignnick10e";
import { MessageFlags } from "discord.js";

describe("Management Context Menu", () => {
    test("execute() returns a reply.", () => {
        const interaction = {
            reply: vi.fn().mockResolvedValue(undefined),
        }
        execute(interaction as any);

        expect(interaction.reply).toHaveBeenCalledOnce();
        expect(interaction.reply).toHaveBeenCalledWith({ content: "Executed..NOT!", flags: MessageFlags.Ephemeral});
    });
});
