import {
  BrowserCacheLocation,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from "@azure/msal-browser";
import { GRAPH_SCOPES, runtimeConfig } from "../config";

const authority = "https://login.microsoftonline.com/consumers";

function redirectUri(): string {
  return new URL(`${runtimeConfig.basePath}auth-popup.html`, window.location.origin).href;
}

export function createMsalInstance(clientId: string): PublicClientApplication {
  const configuration: Configuration = {
    auth: {
      clientId,
      authority,
      redirectUri: redirectUri(),
      postLogoutRedirectUri: new URL(runtimeConfig.basePath, window.location.origin).href,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
    },
  };
  return new PublicClientApplication(configuration);
}

export const loginRequest = {
  scopes: [...GRAPH_SCOPES],
  prompt: "select_account" as const,
  redirectUri: typeof window === "undefined" ? undefined : redirectUri(),
};

export const tokenRequest = (account: AccountInfo) => ({
  scopes: [...GRAPH_SCOPES],
  account,
});
