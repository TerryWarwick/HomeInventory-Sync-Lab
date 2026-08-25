import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

const status = document.querySelector("p");

void broadcastResponseToMainFrame().catch((error: unknown) => {
  console.error("Unable to complete Microsoft sign-in:", error);
  if (status) {
    status.textContent =
      "Unable to complete Microsoft sign-in. Close this window and try again.";
  }
});
