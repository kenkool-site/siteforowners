export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ThemeColors } from "@/lib/templates/themes";

const anthropic = new Anthropic();

const HEX = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!HEX.test(t)) return null;
  return t;
}

function parseThemeColorsPayload(raw: unknown): ThemeColors | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = ["primary", "secondary", "accent", "background", "foreground", "muted"] as const;
  const out: Partial<ThemeColors> = {};
  for (const k of keys) {
    const v = normalizeHex(o[k]);
    if (!v) return null;
    out[k] = v;
  }
  return out as ThemeColors;
}

/** Relative luminance 0–1 (sRGB), for sanity checks only */
function relLuminance(hex: string): number {
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(fg: string, bg: string): number {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

/** Reject obviously unreadable body text on page background (loosened for cream backgrounds). */
function passesBasicContrast(colors: ThemeColors): boolean {
  return contrastRatio(colors.foreground, colors.background) >= 4;
}

export async function POST(request: NextRequest) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionCookie = request.cookies.get("admin_session")?.value;
    if (!adminPassword || sessionCookie !== adminPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      business_name?: string;
      business_type?: string;
      current_colors?: ThemeColors;
      mood?: string;
    };

    const businessName =
      typeof body.business_name === "string" ? body.business_name.trim() : "";
    const businessType =
      typeof body.business_type === "string" ? body.business_type.trim() : "salon";
    const mood = typeof body.mood === "string" ? body.mood.trim().slice(0, 200) : "";
    const current =
      body.current_colors && typeof body.current_colors === "object"
        ? (body.current_colors as ThemeColors)
        : null;

    const currentLine = current
      ? `Current palette (you may evolve it or propose something clearly different if that fits better):\n${JSON.stringify(current, null, 2)}`
      : "No current custom palette — infer from business context.";

    const moodLine = mood ? `Owner preference / direction: ${mood}` : "No extra direction — choose what best suits the business.";

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are a brand designer for small-business websites (salons, food, fitness, etc.).

Business type (vertical): ${businessType}
Business name: ${businessName || "Unknown"}
${moodLine}

${currentLine}

Return ONLY valid JSON with exactly these keys and six-digit hex colors including #:
{
  "primary": "#______",
  "secondary": "#______",
  "accent": "#______",
  "background": "#______",
  "foreground": "#______",
  "muted": "#______"
}

Rules:
- primary = main brand / buttons; accent = highlights; secondary = supporting surfaces.
- background = page wash (usually light, not pure white unless intentional); muted = cards/side panels (slightly different from background).
- foreground = body text on background — must be readable (aim for contrast ratio ≥ 4.5:1 on background).
- Cohesive, modern, not neon; avoid cliché AI purple gradients.
- All values must match /^#[0-9A-Fa-f]{6}$/.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse color suggestion" }, { status: 500 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from model" }, { status: 500 });
    }

    const colors = parseThemeColorsPayload(parsed);
    if (!colors) {
      return NextResponse.json({ error: "Invalid color values from model" }, { status: 500 });
    }

    if (!passesBasicContrast(colors)) {
      return NextResponse.json(
        { error: "Suggested palette failed readability check. Try again or shorten your hint." },
        { status: 422 },
      );
    }

    return NextResponse.json({ colors });
  } catch (e) {
    console.error("suggest-theme-colors:", e);
    return NextResponse.json({ error: "Failed to suggest colors" }, { status: 500 });
  }
}
