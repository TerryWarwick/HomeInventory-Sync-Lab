import type { AccountInfo } from "@azure/msal-browser";

type ExpectedAccount = Pick<AccountInfo, "homeAccountId">;

export function acceptInteractiveAccessToken(
  expectedAccount: ExpectedAccount,
  returnedAccount: AccountInfo | null,
  accessToken: string,
): string {
  if (returnedAccount?.homeAccountId !== expectedAccount.homeAccountId) {
    throw new Error(
      "Interactive token renewal returned a different Microsoft account. Disconnect and reconnect the expected owner before retrying.",
    );
  }
  return accessToken;
}
