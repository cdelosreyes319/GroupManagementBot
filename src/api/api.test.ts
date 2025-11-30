// api.test.ts

import { beforeEach, describe, expect, test, vi } from "vitest";
import { lookupUserDiscordIDs, lookupUserRobloxID } from "./api";

describe("Bloxlink Unit Tests", () => {
    beforeEach(() => {
        vi.restoreAllMocks(); // clean up mocks
    });
    
    //Tests for lookupUserRobloxID
    test("Lookup roblox ID returns correct ID", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ robloxID: "123456" })
        } as Response)));

        const robloxID = await lookupUserRobloxID("999","123");
        expect(robloxID).toBe("123456");
    });
    test("Lookup roblox ID returns null if user is not found", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: false,
            status: 404,
            json: async () => ({ error: "No user found" })
        } as Response)));

        const robloxID = await lookupUserRobloxID("999", "123");
        expect(robloxID).toBe(null);
    });
    test("Lookup roblox ID throws error if response has other errors", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: false,
            status: 500
        } as Response)));

        await expect(lookupUserRobloxID("999", "123")).rejects.toThrow();
    });
    test("Lookup roblox ID throws error if fetch throws error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failure")));

        await expect(lookupUserRobloxID("999", "123")).rejects.toThrow();
    });

    //Tests for lookupUserDiscordID
    test("Lookup discord ID returns one correct ID", async () => {
        const jsonOutput = ["123456"];
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ discordIDs: jsonOutput })
        } as Response)));

        const discordIDs = await lookupUserDiscordIDs("999","123");
        expect(discordIDs).toBe(jsonOutput);
    });
    test("Lookup discord ID returns multiple correct IDs", async () => {
        const jsonOutput = ["123456", "2345"];
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            json: async () => ({ discordIDs: jsonOutput })
        } as Response)));

        const discordIDs = await lookupUserDiscordIDs("999","123");
        expect(discordIDs).toBe(jsonOutput);
    });
    test("Lookup discord ID throws error if response errors", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: false,
            status: 500
        } as Response)));

        await expect(lookupUserDiscordIDs("999", "123")).rejects.toThrow();
    });
    test("Lookup discord ID throws error if fetch throws error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failure")));

        await expect(lookupUserDiscordIDs("999", "123")).rejects.toThrow();
    });
});