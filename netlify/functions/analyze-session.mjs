export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const { topic, domain, findings, notes, langName } = body;
  if (!topic || !findings) {
    return new Response(JSON.stringify({ error: "Missing topic or findings" }), { status: 400 });
  }
  const targetLanguage = langName || "English";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Netlify → Site configuration → Environment variables." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const prompt = `A finance student just did a 15-minute research sprint and a 1-minute speaking drill on this topic, then wrote up their own notes.

Topic: ${topic}
Domain: ${domain}

Their research findings (in their own words):
"""
${findings}
"""

${notes ? `Their self-review notes on delivery:\n"""\n${notes}\n"""\n` : ""}

Write your entire response in ${targetLanguage}, including every field below, regardless of what language their notes are written in.

Based on what they actually wrote, return ONLY raw JSON, no markdown fences, no preamble, in this exact shape:
{
  "takeaways": ["...", "...", "..."],
  "researchFurther": ["...", "..."],
  "visual": { ...one of the five shapes below... }
}

Rules:
- "takeaways": 3 to 5 short, sharp key takeaways that synthesize and clarify what they wrote. If something in their notes looks incomplete, vague, or possibly inaccurate, correct or sharpen it here rather than just restating it.
- "researchFurther": 2 to 4 short bullet points naming specific things worth researching further or double-checking for accuracy, based on gaps in what they wrote.
- "visual": pick whichever ONE of these five shapes best fits this specific topic, and return only that shape's object (always include "type" and "title"):
  1. Comparison (two things contrasted): {"type":"comparison","title":"...","left":{"label":"...","points":["...","...","..."]},"right":{"label":"...","points":["...","...","..."]}} — 2 to 3 points per side.
  2. Timeline (dated or ordered sequence of events): {"type":"timeline","title":"...","events":[{"label":"...","detail":"..."},...]} — 3 to 5 events, in order.
  3. Cycle (a process that repeats/loops back to the start): {"type":"cycle","title":"...","steps":[{"label":"...","detail":"..."},...]} — 3 to 5 steps.
  4. Flow (a one-directional process or sequence of steps): {"type":"flow","title":"...","steps":[{"label":"...","detail":"..."},...]} — 2 to 4 steps.
  5. Stat (the topic revolves around one striking number): {"type":"stat","title":"...","value":"...","unit":"...","context":"one short sentence"}.
- Keep every string concise — a short phrase or one sentence, never a paragraph. "label" fields especially must be 1-4 words.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: (data && data.error && data.error.message) || "Anthropic API error" }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const raw = (data.content && data.content[0] && data.content[0].text) || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
