export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let existingTitles = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.existingTitles)) existingTitles = body.existingTitles;
  } catch (e) {
    // no body / bad JSON — proceed with empty exclusion list
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Netlify → Site configuration → Environment variables." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const prompt = `Generate exactly 72 new "Polymath Sprint" speaking-practice topics for a 1-minute extemporaneous speaking app, 8 topics each across these 9 domain keys: physics, math, history, art, finance, ai, data, sport, lang.

Return ONLY a raw JSON array of 72 objects, nothing else — no markdown fences, no preamble, no explanation, no trailing commentary. Each object must have exactly these keys: "title" (string), "domain" (one of the 9 keys above, exactly as spelled), "hook" (string).

Rules for every topic:
- title: a specific, counterintuitive claim or true story — never a vague subject area — the kind of thing that performs well as short-form content (Instagram Reels/TikTok style curiosity)
- hook: one sentence stating why it's useful or how it bridges to finance, investing, AI, decision-making, sport performance, or language skill — written for a Hong Kong-raised, trilingual (English/Mandarin/Italian) Babson College finance student working toward a 2027 Millennium Management investment internship, with experience in investment banking, investment management, and equity research
- domain spread must be exactly 8 topics per domain, 9 domains, 72 total
- Do not repeat or closely resemble any of these existing titles: ${JSON.stringify(existingTitles)}`;

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
        max_tokens: 4000,
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
    const topics = JSON.parse(cleaned);

    return new Response(JSON.stringify({ topics }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
