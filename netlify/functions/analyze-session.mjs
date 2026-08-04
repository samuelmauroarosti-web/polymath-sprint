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

Write your entire response in ${targetLanguage}, including all three fields below, regardless of what language their notes are written in.

Based on what they actually wrote, return ONLY raw JSON, no markdown fences, no preamble, in this exact shape:
{
  "takeaways": ["...", "...", "..."],
  "researchFurther": ["...", "..."],
  "visualSuggestion": "..."
}

Rules:
- "takeaways": 3 to 5 short, sharp key takeaways that synthesize and clarify what they wrote. If something in their notes looks incomplete, vague, or possibly inaccurate, correct or sharpen it here rather than just restating it.
- "researchFurther": 2 to 4 short bullet points naming specific things worth researching further or double-checking for accuracy, based on gaps in what they wrote.
- "visualSuggestion": one or two sentences describing a single specific diagram, chart, or timeline they could sketch or look up that would reinforce this topic (describe it, don't generate an image).
- Keep every string concise — a sentence or short phrase, not a paragraph.`;

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
        max_tokens: 1200,
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
