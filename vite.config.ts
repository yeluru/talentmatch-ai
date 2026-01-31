import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Large/heavy libs (keep separate)
          if (id.includes("pdf-lib")) return "pdf-lib";
          if (id.includes("docx")) return "docx";
          if (id.includes("recharts")) return "charts";
          if (id.includes("react-day-picker")) return "calendar";
          if (id.includes("react-hook-form") || id.includes("@hookform/resolvers")) return "forms";
          if (id.includes("zod")) return "zod";
          // React ecosystem: one chunk so React, Radix, next-themes etc. share same React instance
          if (id.includes("react-dom") || id.match(/node_modules\/react\//)) return "vendor";
          if (id.includes("@radix-ui")) return "vendor";
          if (id.includes("next-themes")) return "vendor";
          if (id.includes("react-router")) return "vendor";
          if (id.includes("@tanstack")) return "react-query";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("lucide-react")) return "icons";
          // Fallback vendor bucket
          return "vendor";
        },
      },
    },
  },
}));
