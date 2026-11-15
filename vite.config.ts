import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig, loadEnv, Plugin} from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// apiKey is read via loadEnv() in the config below: Vite does NOT copy .env
// values into process.env, so reading process.env here would miss a .env file.
function marsweaveApiPlugin(apiKey: string | undefined, model: string): Plugin {
  return {
    name: 'marsweave-api-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/api/copilot' || req.method !== 'POST') return next();
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          const { runCopilot } = await server.ssrLoadModule('/server/copilotHandler.ts');
          const result = await runCopilot(body, apiKey, model);
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.body));
        });
      });
    },
  };
}

export default defineConfig(({mode}) => {
  // Loads .env / .env.local (and AI Studio-injected process.env) for the server middleware.
  const env = loadEnv(mode, rootDir, '');
  return {
    plugins: [react(), tailwindcss(), marsweaveApiPlugin(env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-2.5-flash')],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

