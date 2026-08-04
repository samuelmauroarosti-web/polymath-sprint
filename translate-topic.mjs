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

  const { title, hook, langName } = body;
  if (!title || !langName) {
    return new Response(JSON.stringify({ error: "Missing title or langName" }), { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Netlify → Site configuration → Environment variables." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const prompt = `Translate the following English topic title and one-sentence hook into ${langName}. This is for a finance student's speaking-practice app — keep the tone confident and the meaning exact. Do not add explanation or notes, just the translation.

Title: ${title}
Hook: ${hook || ""}

Return ONLY raw JSON, no markdown fences, no preamble, in this exact shape:
{"title": "...", "hook": "..."}`;

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
        max_tokens: 500,
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
