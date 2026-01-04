// manage.test.ts
import { describe, test, expect, vi, it, beforeEach } from "vitest";
import { execute } from "./manage";
import * as api from "../api/api";
import { handleJoinRequest } from "noblox.js";
import * as global from "../init"

// Initialise mock variables needed
const discorduserID = "456456456456";
const robloxID = "123123123123";
const corpsID = "746746";
const mainID = "573472";
function mockInteraction() {
    return {
        deferReply: vi.fn(),
        editReply: vi.fn(),
        options: {
            getUser: vi.fn()
        },
    }
}

describe("ranks accept subcommand group", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("accepts user into both groups if pending to both", async () => {
        const interaction = mockInteraction();
        interaction.options.getUser.mockReturnValue( {
            user: { id: discorduserID }
        });
        vi.mock('noblox.js', () => ({
            handleJoinRequest: vi.fn(),
            getJoinRequest: vi.fn().mockResolvedValue(true), // Return true always as user has requests to both groups
            getRankInGroup: vi.fn().mockResolvedValue(0) // user is not in groups
        }));
        vi.spyOn(api, 'lookupUserRobloxID').mockResolvedValue(robloxID);
        vi.spyOn(global, 'groups', 'get').mockReturnValue({ ROBLOX_CORPS_ID : corpsID, DISCORD_CORPS_ID : "1111", ROBLOX_MAIN_ID : mainID });
        await execute(interaction as any);
        expect(interaction.deferReply).toBeCalled(); // Delay reply until stuff is done

        // Check if join requests to both groups are handled
        expect(handleJoinRequest).toBeCalledWith(parseInt(mainID), parseInt(robloxID), true);
        expect(handleJoinRequest).toBeCalledWith(parseInt(corpsID), parseInt(robloxID), true);
        expect(interaction.editReply).toBeCalledTimes(2); // Ensure reply is updated once for each group checked
    });
    test("accepts user into main | replies if user has sent join request to or is already in corps group", async () => {
        const interaction = mockInteraction();
        interaction.options.getUser.mockReturnValue( {
            user: { id: discorduserID }
        });
        vi.mock('noblox.js', () => ({
            handleJoinRequest: vi.fn(),
            getJoinRequest: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false), // request sent to main, no request sent to corps
            getRankInGroup: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1), // user is not in main, user is in corps
        }));
        vi.spyOn(api, 'lookupUserRobloxID').mockResolvedValue(robloxID);
        vi.spyOn(global, 'groups', 'get').mockReturnValue({ ROBLOX_CORPS_ID : corpsID, DISCORD_CORPS_ID : "1111", ROBLOX_MAIN_ID : mainID });

        await execute(interaction as any);
        expect(interaction.deferReply).toBeCalled(); // Delay reply until stuff is done
        expect(handleJoinRequest).toBeCalledWith(parseInt(corpsID), parseInt(robloxID), true); // Check if corps request acceptance is ran
        expect(interaction.editReply).toBeCalledTimes(2); // Ensure reply is updated once for each group checked
    });
    test("accepts user into corps | replies if user has sent join request to or is already in main group", async () => {
        const interaction = mockInteraction();
        interaction.options.getUser.mockReturnValue( {
            user: { id: discorduserID }
        });
        vi.mock('noblox.js', () => ({
            handleJoinRequest: vi.fn(),
            getJoinRequest: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), // request sent to corps, no request sent to main
            getRankInGroup: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0), // user is not in corps, user is in main
        }));
        vi.spyOn(api, 'lookupUserRobloxID').mockResolvedValue(robloxID);
        vi.spyOn(global, 'groups', 'get').mockReturnValue({ ROBLOX_CORPS_ID : corpsID, DISCORD_CORPS_ID : "1111", ROBLOX_MAIN_ID : mainID });

        await execute(interaction as any);
        expect(interaction.deferReply).toBeCalled(); // Delay reply until stuff is done
        expect(handleJoinRequest).toBeCalledWith(parseInt(mainID), parseInt(robloxID), true); // Check if main request acceptance is ran
        expect(interaction.editReply).toBeCalledTimes(2); // Ensure reply is updated once for each group checked
    });
    test("throws error if robloxID not found", async () => {

    });
});

