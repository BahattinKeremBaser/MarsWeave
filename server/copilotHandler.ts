// Shared Gemini copilot handler. Used by the Vite dev middleware (vite.config.ts) and by the
// serverless function (api/copilot.ts). The API key is read on the server only; it is never sent to the browser.
export interface CopilotResult { status: number; body: Record<string, unknown> }

export const COPILOT_SYSTEM_INSTRUCTION = `You are MARSWEAVE COPILOT, an aerospace mission advisory system for human surface extravehicular activity (EVA) on Mars (Arcadia Planitia: 39.3°N, 171.4°W).
Your purpose is to answer operational, geospatial, and scientific queries from the mission context supplied below.
In this application only elevation can be real (USGS MOLA-HRSC DEM, when loaded) and slope is derived from it; radiation uses a published MSL RAD value as a proxy; hazard, ice, mineral, thermal, comms and science-target layers are modelled or simulated placeholders. Never present simulated values as NASA measurements, say which kind a value is when asked, and say when you do not know.
Never hallucinate non-existent features. Keep your answers concise, authoritative, and structured for an astronaut on an active Marswalk or mission control flight controller.`

export async function runCopilot(raw: unknown, apiKey: string | undefined, model = 'gemini-2.5-flash'): Promise<CopilotResult> {
  const FALLBACK: CopilotResult = { status: 503, body: { fallback: true } };
  if (!apiKey) return FALLBACK;
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw ?? {}) as { prompt?: unknown; context?: unknown };
    if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 2000) {
      return { status: 400, body: { error: 'prompt must be a non-empty string up to 2000 characters' } };
    }
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: `Context of active mission: ${JSON.stringify(data.context ?? {})}\n\nOperator Question: ${data.prompt}`,
      config: { systemInstruction: COPILOT_SYSTEM_INSTRUCTION }
    });
    // The client falls back to its local rule engine on any non-200 reply, so an empty answer counts as a failure.
    if (!response.text) return FALLBACK;
    return { status: 200, body: { reply: response.text } };
  } catch (err) {
    console.error('Gemini API call failed:', err);
    return FALLBACK;
  }
}
