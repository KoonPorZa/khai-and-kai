import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/noto-sans-thai/thai-500.css";
import "@fontsource/noto-sans-thai/thai-700.css";
import "./styles.css";
import { wagmiConfig } from "./config/wagmi";
import { ToastProvider } from "./components/Toast";
import { WalletProvider } from "./components/Wallet";
import { App } from "./App";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
