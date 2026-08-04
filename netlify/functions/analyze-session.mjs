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

Write your entire response in ${targetLanguage}, including every field, regardless of what language their notes are written in.

Rules:
- takeaways: 3 to 5 short, sharp key takeaways that synthesize and clarify what they wrote. If something in their notes looks incomplete, vague, or possibly inaccurate, correct or sharpen it here rather than just restating it.
- researchFurther: 2 to 4 short bullet points naming specific things worth researching further or double-checking for accuracy, based on gaps in what they wrote.
- visual: pick whichever ONE of these five shapes best fits this specific topic:
  1. Comparison (two things contrasted): set type="comparison", fill left.label, left.points (2-3), right.label, right.points (2-3).
  2. Timeline (dated or ordered sequence): set type="timeline", fill events (3-5 items, each with label + detail).
  3. Cycle (a process that loops back to the start): set type="cycle", fill steps (3-5 items, each with label + detail).
  4. Flow (a one-directional process): set type="flow", fill steps (2-4 items, each with label + detail).
  5. Stat (topic revolves around one striking number): set type="stat", fill value, unit, context.
  Only fill the fields relevant to the chosen type; leave the rest empty. Always fill title.
- Keep every string concise — a short phrase or one sentence, never a paragraph. Label fields must be 1-4 words.
- Use single quotes, not double quotes, for any quoted term or phrase.

Call the submit_insights tool with the result.`;

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
        max_tokens: 1800,
        tools: [{
          name: "submit_insights",
          description: "Submit key takeaways, further research points, and a visual diagram spec.",
          input_schema: {
            type: "object",
            properties: {
              takeaways: { type: "array", items: { type: "string" } },
              researchFurther: { type: "array", items: { type: "string" } },
              visual: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["comparison", "timeline", "cycle", "flow", "stat"] },
                  title: { type: "string" },
                  left: {
                    type: "object",
                    properties: { label: { type: "string" }, points: { type: "array", items: { type: "string" } } },
                  },
                  right: {
                    type: "object",
                    properties: { label: { type: "string" }, points: { type: "array", items: { type: "string" } } },
                  },
                  events: {
                    type: "array",
                    items: { type: "object", properties: { label: { type: "string" }, detail: { type: "string" } } },
                  },
                  steps: {
                    type: "array",
                    items: { type: "object", properties: { label: { type: "string" }, detail: { type: "string" } } },
                  },
                  value: { type: "string" },
                  unit: { type: "string" },
                  context: { type: "string" },
                },
                required: ["type", "title"],
              },
            },
            required: ["takeaways", "researchFurther", "visual"],
          },
        }],
        tool_choice: { type: "tool", name: "submit_insights" },
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

    const toolBlock = (data.content || []).find(b => b.type === "tool_use" && b.name === "submit_insights");
    if (!toolBlock || !toolBlock.input) throw new Error("Model did not return structured insights");

    return new Response(JSON.stringify(toolBlock.input), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
