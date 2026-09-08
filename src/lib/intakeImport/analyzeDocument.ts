import Anthropic from "@anthropic-ai/sdk";
import { intakeImportDraftSchema, type IntakeImportDraft } from "@/lib/validation/schemas";

const TOOL_NAME = "submit_intake_draft";

const SYSTEM_PROMPT = `You extract structured product-planning information from a document (a slide deck, spec, brief, or similar) so it can pre-fill a planning tool's intake form. The person reviewing your output will accept or reject each field individually, so:
- Only include a field when the document gives reasonable, specific evidence for it. Never invent, guess, or pad with generic filler.
- Omit any field you're not reasonably confident about — an omitted field is safe, a wrong one is not.
- For capabilities, list only distinct features, workstreams, or deliverables the document actually describes as in-scope. Don't invent a generic set to fill out a roadmap shape.
- effortSize/businessValue/riskLevel are rough inferences at best — only set them when the document gives a real signal (e.g. explicit priority/phase language, described complexity), otherwise omit them and let the person set them manually.
- targetLaunchDate must be an explicit date (yyyy-mm-dd); don't compute one from vague timeframes like "next quarter".
Call the ${TOOL_NAME} tool exactly once with your findings.`;

const INTAKE_IMPORT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit the structured planning information extracted from the document.",
  input_schema: {
    type: "object",
    properties: {
      productDirection: {
        type: "object",
        description: "What the initiative is and who it's for.",
        properties: {
          name: { type: "string", description: "Short name/title of the initiative or product, if explicitly named." },
          problemStatement: { type: "string", description: "The problem being solved, if stated." },
          targetCustomer: { type: "string", description: "Who this is for, if stated." },
        },
      },
      success: {
        type: "object",
        description: "Why this initiative matters and how success is measured — the incentive/business case.",
        properties: {
          outcomeStatement: { type: "string", description: "The desired measurable outcome or goal." },
          outcomeMetric: { type: "string", description: "How success will be measured, if a specific metric is given." },
          targetLaunchDate: { type: "string", description: "Target launch date as yyyy-mm-dd, only if an explicit date is given." },
          budget: { type: "number", description: "Approved or available budget in dollars, only if an explicit number is given." },
        },
      },
      capabilities: {
        type: "array",
        description: "Distinct features/capabilities/workstreams described as part of the scope or roadmap.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short capability name." },
            description: { type: "string", description: "One sentence describing what it does." },
            isMvp: { type: "boolean", description: "True if described as part of the MVP/phase 1/must-have; false if explicitly later/future." },
            effortSize: { type: "string", enum: ["xs", "s", "m", "l", "xl"] },
            businessValue: { type: "string", enum: ["very_low", "low", "medium", "high", "critical"] },
            riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
          },
          required: ["name"],
        },
      },
      warnings: {
        type: "array",
        description: "Notes about ambiguous, conflicting, or missing information the reviewer should double check.",
        items: { type: "string" },
      },
    },
  },
};

// apiKey is the requesting user's own key (decrypted from User.anthropicApiKeyEncrypted,
// src/lib/security/secretBox.ts) — this call never falls back to a shared/server-wide key.
export async function analyzeIntakeDocument(documentText: string, apiKey: string): Promise<IntakeImportDraft> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Document text:\n\n${documentText}` }],
    tools: [INTAKE_IMPORT_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Model did not return structured output.");

  const parsed = intakeImportDraftSchema.parse(toolUse.input);
  return {
    ...parsed,
    // A name is the one field the model was required to set (`required: ["name"]`
    // in the tool schema) — the lenient schema still lets it through empty on a
    // malformed response, so drop anything that didn't survive with a real name.
    capabilities: (parsed.capabilities ?? []).filter((c) => c.name.trim().length >= 3),
  };
}
