export async function deriveOwnerId(homeAccountId: string): Promise<string> {
  const normalized = homeAccountId.trim();
  if (!normalized) {
    throw new Error("A non-empty homeAccountId is required.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
