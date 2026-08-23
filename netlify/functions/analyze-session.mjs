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

  const { topic, domain, findings, notes, langName, mode } = body;
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

  const isDelivery = mode === "delivery";

  let prompt, tool;

  if (isDelivery) {
    prompt = `A finance student just did a 1-minute speaking drill on this topic, then wrote self-review notes on their own delivery.

Topic: ${topic}

${notes ? `Their self-review notes on delivery:\n"""\n${notes}\n"""\n` : "They did not write any self-review notes on delivery this time."}

Write your entire response in ${targetLanguage}.

Give 2 to 4 sentences of honest, specific feedback on HOW they delivered the speech — not the topic content itself. If they wrote self-review notes, respond directly to what they said about their own delivery (filler words, structure, pacing, confidence) and tell them plainly what's working and what to fix next time. If they did not write any self-review notes, say so plainly and give one concrete suggestion for what to self-observe and note down next time (e.g. count filler words, time your intro, notice where you paused). Use single quotes, not double quotes, for any quoted term or phrase.

Call the submit_delivery_feedback tool with the result.`;

    tool = {
      name: "submit_delivery_feedback",
      description: "Submit feedback on the speaker's delivery.",
      input_schema: {
        type: "object",
        properties: { deliveryFeedback: { type: "string" } },
        required: ["deliveryFeedback"],
      },
    };
  } else {
    prompt = `A finance student just did a 15-minute research sprint on this topic, then wrote up their own research findings.

Topic: ${topic}
Domain: ${domain}

Their research findings (in their own words):
"""
${findings}
"""

Write your entire response in ${targetLanguage}.

Rules:
- takeaways: exactly 3 to 5 short, sharp key takeaways that synthesize and clarify what they wrote about the TOPIC. If something looks incomplete, vague, or possibly inaccurate, correct or sharpen it here rather than just restating it. Never return fewer than 3.
- researchFurther: exactly 2 to 4 short bullet points naming specific things worth researching further or double-checking for accuracy, based on gaps in what they wrote. Never return fewer than 2.
- visual: pick whichever ONE of these five shapes best fits this specific topic:
  1. Comparison (two things contrasted): set type="comparison", fill left.label, left.points (2-3), right.label, right.points (2-3).
  2. Timeline (dated or ordered sequence): set type="timeline", fill events (3-5 items, each with label + detail).
  3. Cycle (a process that loops back to the start): set type="cycle", fill steps (3-5 items, each with label + detail).
  4. Flow (a one-directional process): set type="flow", fill steps (2-4 items, each with label + detail).
  5. Stat (topic revolves around one striking number): set type="stat", fill value, unit, context.
  Only fill the fields relevant to the chosen type; leave the rest empty. Always fill title.
- Keep every string concise — a short phrase or one sentence, never a paragraph.
- Use single quotes, not double quotes, for any quoted term or phrase.
- This is about the TOPIC only. Do not comment on delivery, speaking style, or self-review notes — that is handled separately.

Call the submit_topic_insights tool with the result.`;

    tool = {
      name: "submit_topic_insights",
      description: "Submit key takeaways, further research points, and a visual diagram spec about the topic itself.",
      input_schema: {
        type: "object",
        properties: {
          takeaways: { type: "array", items: { type: "string" }, minItems: 3 },
          researchFurther: { type: "array", items: { type: "string" }, minItems: 2 },
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
    };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: isDelivery ? 700 : 1800,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
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

    const toolBlock = (data.content || []).find(b => b.type === "tool_use" && b.name === tool.name);
    if (!toolBlock || !toolBlock.input) throw new Error("Model did not return structured output");

    return new Response(JSON.stringify(toolBlock.input), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err && err.message ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
