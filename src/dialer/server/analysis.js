import Anthropic from "@anthropic-ai/sdk";

let client;

function getAnthropic() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Reuses the host app's configured model (ANTHROPIC_MODEL), overridable with
// ANALYSIS_MODEL. Capable enough for call analysis and cost-effective.
const MODEL =
  process.env.ANALYSIS_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Structured output via a forced tool call — guarantees valid JSON back.
const ANALYSIS_TOOL = {
  name: "record_call_analysis",
  description:
    "Record the structured analysis of a sales call transcript between an Agent and a Lead.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "A concise 2-4 sentence summary of the call.",
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative", "mixed"],
        description: "Overall sentiment of the lead during the call.",
      },
      sentimentScore: {
        type: "number",
        description: "Sentiment from -1.0 (very negative) to 1.0 (very positive).",
      },
      keyPoints: {
        type: "array",
        items: { type: "string" },
        description: "The most important points discussed (3-6 bullets).",
      },
      actionItems: {
        type: "array",
        items: { type: "string" },
        description: "Concrete follow-up actions for the sales rep.",
      },
      outcome: {
        type: "string",
        description:
          "Short label for the call outcome, e.g. 'interested', 'callback requested', 'not interested', 'voicemail'.",
      },
    },
    required: ["summary", "sentiment", "sentimentScore", "keyPoints", "actionItems"],
  },
};

/**
 * Analyze a call transcript with Claude. Returns the structured analysis object
 * (matches ANALYSIS_TOOL.input_schema).
 *
 * @param {string} transcript - The full call transcript text.
 * @param {object} [context]
 * @param {string} [context.leadName]
 * @param {string} [context.leadCompany]
 */
export async function analyzeTranscript(transcript, context = {}) {
  const anthropic = getAnthropic();
  const who = [context.leadName, context.leadCompany].filter(Boolean).join(", ");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "record_call_analysis" },
    system: [
      {
        type: "text",
        text:
          "You are a sales-call analyst. Given a transcript of a phone call between a sales Agent and a Lead, " +
          "produce an objective, concise analysis. Be specific and avoid filler.",
        // Cache the static system prompt + tool schema across calls.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          (who ? `Lead: ${who}\n\n` : "") +
          `Transcript:\n${transcript}\n\nAnalyze this call and call the record_call_analysis tool.`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool_use block");
  return toolUse.input;
}
