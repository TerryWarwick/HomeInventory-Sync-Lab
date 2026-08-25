export const APP_NAME = "HomeInventory Sync Lab";
export const APP_VERSION = "1.0.0";
export const PROTOCOL_VERSION = 1;
export const DB_NAME = "homeinventory-sync-lab";
export const LAB_MARKER = "homeinventory-sync-lab.synthetic";
export const GRAPH_SCOPE = "Files.ReadWrite.AppFolder";
export const GRAPH_SCOPES = [GRAPH_SCOPE] as const;

const normalizeBase = (value: string | undefined): string => {
  const base = value?.trim() || "/";
  return `${base.startsWith("/") ? base : `/${base}`}${base.endsWith("/") ? "" : "/"}`;
};

export const runtimeConfig = {
  clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim() ?? "",
  basePath: normalizeBase(import.meta.env.VITE_BASE_PATH),
};
