// Serverless endpoint (Vercel-style Node function). Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in the host's
// environment variables. Without a key it answers 503 and the app uses its local, telemetry-grounded rule engine.
import { runCopilot } from '../server/copilotHandler';

export default async function handler(
  req: { method?: string; body?: unknown },
  res: { status: (c: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const result = await runCopilot(req.body, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  return res.status(result.status).json(result.body);
}
