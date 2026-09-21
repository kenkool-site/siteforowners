// src/lib/invitations/memories/ai-provider.ts
import type { ModerationStatus } from "./types";

export interface ModerationResult {
  highestConfidence: number; // 0-1
  categories: string[];
}

export interface ModerationOutcome {
  moderationStatus: ModerationStatus;
  moderationScore: number;
  moderationCategories: string[];
}

const REJECT_THRESHOLD = 0.85;
const FLAG_THRESHOLD = 0.4;

export function resolveModerationOutcome(
  mode: "auto_publish" | "review_required",
  result: ModerationResult,
): ModerationOutcome {
  const base = { moderationScore: result.highestConfidence, moderationCategories: result.categories };

  if (result.highestConfidence >= REJECT_THRESHOLD) {
    return { ...base, moderationStatus: "rejected" };
  }
  if (result.highestConfidence >= FLAG_THRESHOLD) {
    return { ...base, moderationStatus: "flagged" };
  }
  return { ...base, moderationStatus: mode === "auto_publish" ? "approved" : "awaiting_host_review" };
}

export interface AIProvider {
  moderateImage(bytes: Uint8Array): Promise<ModerationResult>;
}

export class RekognitionAIProvider implements AIProvider {
  async moderateImage(bytes: Uint8Array): Promise<ModerationResult> {
    const { RekognitionClient, DetectModerationLabelsCommand } =
      require("@aws-sdk/client-rekognition") as typeof import("@aws-sdk/client-rekognition");
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const response = await client.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 30 }),
    );
    const labels = response.ModerationLabels ?? [];
    const highestConfidence = labels.reduce((max, label) => Math.max(max, (label.Confidence ?? 0) / 100), 0);
    return { highestConfidence, categories: labels.map((label) => label.Name ?? "unknown") };
  }
}
