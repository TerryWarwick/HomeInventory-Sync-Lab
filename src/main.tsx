import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import { App } from "./App";
import { createMsalInstance } from "./auth/msal";
import { runtimeConfig } from "./config";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

if (!runtimeConfig.clientId) {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  const msal = createMsalInstance(runtimeConfig.clientId);
  await msal.initialize();
  await msal.handleRedirectPromise();
  root.render(
    <StrictMode>
      <MsalProvider instance={msal}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
}
