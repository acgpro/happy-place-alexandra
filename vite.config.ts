// Configuration Vite standard (remplace @lovable.dev/vite-tanstack-config).
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Les fonctions serveur lisent process.env, que Vite ne remplit pas depuis le fichier .env.
// On y recopie les valeurs nécessaires (jamais envoyées au navigateur : pas de préfixe VITE_).
function setIfMissing(name: string, value: string | undefined) {
  if (!process.env[name] && value) process.env[name] = value;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  setIfMissing("SUPABASE_URL", env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  setIfMissing("SUPABASE_PUBLISHABLE_KEY", env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY);
  setIfMissing("MAKE_WEBHOOK_URL", env.MAKE_WEBHOOK_URL);
  return {
  server: {
    port: 3000,
    // Autorise l'aperçu dans GitHub Codespaces (adresses en *.app.github.dev)
    allowedHosts: [".app.github.dev"],
  },
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"] },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      // Point d'entrée serveur : src/server.ts (page d'erreur propre en cas de plantage)
      server: { entry: "server" },
    }),
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
};
});
