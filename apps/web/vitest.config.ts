import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@a1plus/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts"),
      "@a1plus/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@a1plus/ui": path.resolve(__dirname, "../../packages/ui/src/index.tsx")
    }
  }
});
