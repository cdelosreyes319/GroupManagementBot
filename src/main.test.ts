import * as vi from "vitest";
import * as config from "./init";

vi.describe("Vitest test", () => {
    vi.test("Group ID is correct", () => {
        vi.expect(config.getCorpsID()).toBe(config.groups.DISCORD_CORPS_ID);
        // sup
    })
})