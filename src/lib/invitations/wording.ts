import Anthropic from "@anthropic-ai/sdk";

export const INVITATION_WORDING_MODEL = "claude-haiku-4-5-20251001";

export type InvitationWordingInput = {
  title: string;
  honoreeNames: string;
  eventType: string;
  locale: string;
  startsAt: string | null;
  venueName: string | null;
  address: string | null;
};

export type InvitationWording = {
  description: string;
  rsvpPrompt: string;
  styleNote: string;
};

type Dependencies = {
  generate?(input: InvitationWordingInput): Promise<string>;
};

function cleanString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length <= maximum ? cleaned : null;
}

function publicString(event: Record<string, unknown>, key: string): string {
  return typeof event[key] === "string" ? event[key].trim() : "";
}

function publicNullableString(event: Record<string, unknown>, key: string): string | null {
  const value = publicString(event, key);
  return value || null;
}

export function buildInvitationWordingInput(event: Record<string, unknown>): InvitationWordingInput {
  return {
    title: publicString(event, "title"),
    honoreeNames: publicString(event, "honoreeNames"),
    eventType: publicString(event, "eventType"),
    locale: publicString(event, "locale") || "en",
    startsAt: publicNullableString(event, "startsAt"),
    venueName: publicNullableString(event, "venueName"),
    address: publicNullableString(event, "address"),
  };
}

export function normalizeInvitationWording(value: unknown): InvitationWording | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const description = cleanString(record.description, 600);
  const rsvpPrompt = cleanString(record.rsvpPrompt, 180);
  const styleNote = cleanString(record.styleNote, 240);
  if (description === null || rsvpPrompt === null || styleNote === null || !description) return null;
  return { description, rsvpPrompt, styleNote };
}

function parseObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch { return null; }
}

async function anthropicWording(input: InvitationWordingInput): Promise<string> {
  const response = await new Anthropic().messages.create({
    model: INVITATION_WORDING_MODEL,
    max_tokens: 700,
    messages: [{
      role: "user",
      content: `Write warm, polished wording for this event invitation. Use only the supplied facts; do not invent people, logistics, dress codes, or promises. Match the requested locale. Return ONLY JSON with description, rsvpPrompt, and styleNote. Description must be at most 600 characters, rsvpPrompt 180, and styleNote 240.\n\nEvent facts:\n${JSON.stringify(input)}`,
    }],
  });
  const block = response.content.find((item) => item.type === "text");
  return block?.type === "text" ? block.text : "";
}

export async function suggestInvitationWording(
  input: InvitationWordingInput,
  dependencies: Dependencies = {},
): Promise<InvitationWording> {
  const raw = await (dependencies.generate ?? anthropicWording)(input);
  const wording = normalizeInvitationWording(parseObject(raw));
  if (!wording) throw new Error("AI returned invalid invitation wording");
  return wording;
}
