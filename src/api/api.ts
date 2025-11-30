// api.ts
// *********
// Handle api interactions with bloxlink

import { env } from "../init";

class ApiError extends Error {
    constructor(public code: string, public status?: number, public cause?: unknown) {
        super(code);
        this.name = "ApiError";
    }
}

//Bloxlink Server API
export async function lookupUserRobloxID(serverID_discord : string, discordID : string) {
    try {
        const response = await fetch(`https://api.blox.link/v4/public/guilds/${serverID_discord}/discord-to-roblox/${discordID}`, { headers: { "Authorization": `${env.BLOXLINK_KEY}` } });
        const responseJSON = await response.json();
        if (!response.ok && response.status === 404) { 
            return null; 
        }
        else if (!response.ok){
            throw new ApiError("fetch failed: ", response.status)
        }

        return responseJSON.robloxID;
    }
    catch (error) {
        throw new ApiError("lookupUserRobloxID failed: ", undefined, error);
    }
} 

export async function lookupUserDiscordIDs(serverID_discord : string, robloxID : string) {
    try {
        const response = await fetch (`https://api.blox.link/v4/public/guilds/${serverID_discord}/roblox-to-discord/${robloxID}`, { headers: { "Authorization": `${env.BLOXLINK_KEY}` } });
        if (!response.ok) { throw new ApiError("fetch failed: ", response.status) }
        const json = await response.json();
        return json.discordIDs;
    }
    catch (error) {
        throw new ApiError("lookupUserDiscordID failed: ", undefined, error);
    }
}