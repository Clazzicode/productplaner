/** App-owned proposal types; provider SDK types stay in client.ts. */
export interface AiTool {
  name: string;
  description?: string;
  input_schema: { type: "object"; [key: string]: unknown };
}
export interface AiTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
export interface AiRequest {
  model: string;
  max_tokens: number;
  system: string | AiTextBlock[];
  messages: { role: "user"; content: string }[];
  tools: AiTool[];
  tool_choice: { type: "tool"; name: string };
}
export interface AiMessage {
  content: { type: "tool_use"; input: unknown }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}
