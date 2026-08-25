import { describe, expect, it } from "vitest";
import type { AccountInfo } from "@azure/msal-browser";
import { acceptInteractiveAccessToken } from "./interactiveToken";

const account = (homeAccountId: string): AccountInfo => ({
  homeAccountId,
  environment: "login.microsoftonline.com",
  tenantId: "consumers",
  username: `${homeAccountId}@example.test`,
  localAccountId: homeAccountId,
  name: homeAccountId,
  idTokenClaims: {},
});

describe("acceptInteractiveAccessToken", () => {
  it("accepts a token only for the exact expected home account", () => {
    expect(acceptInteractiveAccessToken(account("owner-a"), account("owner-a"), "token-a")).toBe("token-a");
  });

  it("rejects a token returned for another account", () => {
    expect(() => acceptInteractiveAccessToken(account("owner-a"), account("owner-b"), "token-b"))
      .toThrow(/Disconnect and reconnect the expected owner/);
  });

  it("rejects a token without returned account information", () => {
    expect(() => acceptInteractiveAccessToken(account("owner-a"), null, "token"))
      .toThrow(/different Microsoft account/);
  });
});
