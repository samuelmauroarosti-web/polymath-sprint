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

  const prompt = `Translate the following English topic title and one-sentence hook into ${langName}. This is for a finance student's speaking-practice app — keep the tone confident and the meaning exact.

Title: ${title}
Hook: ${hook || ""}

Call the submit_translation tool with the result.`;

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
        max_tokens: 600,
        tools: [{
          name: "submit_translation",
          description: "Submit the translated title and hook.",
          input_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              hook: { type: "string" },
            },
            required: ["title", "hook"],
          },
        }],
        tool_choice: { type: "tool", name: "submit_translation" },
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

    const toolBlock = (data.content || []).find(b => b.type === "tool_use" && b.name === "submit_translation");
    if (!toolBlock || !toolBlock.input) throw new Error("Model did not return a structured translation");

    return new Response(JSON.stringify(toolBlock.input), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
