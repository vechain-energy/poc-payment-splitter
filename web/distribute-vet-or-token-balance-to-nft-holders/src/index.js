import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VeChainProvider } from "@vechain.energy/use-vechain";

import App from "./App";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <VeChainProvider
      config={{ node: "https://testnet.veblocks.net", network: "test" }}
      options={{
        delegate: "https://sponsor-testnet.vechain.energy/by/90",
        delegateTest: "https://sponsor-testnet.vechain.energy/by/90/test"
      }}
    >
      <App />
    </VeChainProvider>
  </StrictMode>
);
