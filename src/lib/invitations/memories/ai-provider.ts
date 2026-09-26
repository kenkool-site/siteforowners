// src/lib/invitations/memories/ai-provider.ts
import { RekognitionClient, DetectModerationLabelsCommand, DetectLabelsCommand, DetectFacesCommand, CompareFacesCommand } from "@aws-sdk/client-rekognition";
import type { ModerationStatus } from "./types";

export interface DetectedLabel {
  name: string;
  confidence: number; // 0-1
}

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
  detectLabels(bytes: Uint8Array): Promise<DetectedLabel[]>;
  detectFaces(bytes: Uint8Array): Promise<boolean>;
  compareFaces(sourceBytes: Uint8Array, targetBytes: Uint8Array, similarityThreshold: number): Promise<number>;
}

export class RekognitionAIProvider implements AIProvider {
  async moderateImage(bytes: Uint8Array): Promise<ModerationResult> {
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const response = await client.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 30 }),
    );
    const labels = response.ModerationLabels ?? [];
    const highestConfidence = labels.reduce((max, label) => Math.max(max, (label.Confidence ?? 0) / 100), 0);
    return { highestConfidence, categories: labels.map((label) => label.Name ?? "unknown") };
  }

  async detectLabels(bytes: Uint8Array): Promise<DetectedLabel[]> {
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const response = await client.send(
      new DetectLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 50, MaxLabels: 20 }),
    );
    const labels = response.Labels ?? [];
    return labels
      .filter((label) => label.Name)
      .map((label) => ({ name: label.Name as string, confidence: (label.Confidence ?? 0) / 100 }));
  }

  async detectFaces(bytes: Uint8Array): Promise<boolean> {
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const response = await client.send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
    return (response.FaceDetails ?? []).length > 0;
  }

  async compareFaces(sourceBytes: Uint8Array, targetBytes: Uint8Array, similarityThreshold: number): Promise<number> {
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    try {
      const response = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: sourceBytes },
          TargetImage: { Bytes: targetBytes },
          SimilarityThreshold: similarityThreshold,
        }),
      );
      const matches = response.FaceMatches ?? [];
      return matches.reduce((max, match) => Math.max(max, match.Similarity ?? 0), 0);
    } catch (error) {
      // Rekognition throws InvalidParameterException when it can't find a
      // detectable face in either image — a normal outcome for this feature
      // (a candidate photo with nobody recognizable in it, say), not a real
      // error. Every other error still propagates.
      if (error instanceof Error && error.name === "InvalidParameterException") return 0;
      throw error;
    }
  }
}
