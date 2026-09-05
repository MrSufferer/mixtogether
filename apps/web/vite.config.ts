import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isMock = process.env.VITE_E2E_MOCK === "1";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: isMock
      ? [
          {
            find: /.*\/lib\/config(\.ts)?$/,
            replacement: path.resolve(__dirname, "./src/lib/config.e2e.ts"),
          },
          {
            find: "@zama-fhe/react-sdk",
            replacement: path.resolve(__dirname, "./src/test/e2e/zama-sdk.mock.tsx"),
          },
        ]
      : [],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: "./src/test/setup.ts",
  },
});
