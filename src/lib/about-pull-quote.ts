const DEFAULT_PULL_QUOTE = "Texture respected. Style elevated.";
const MAX_PULL_QUOTE_LEN = 132;

/**
 * Runway (and similar) about layouts use paragraph 1's opening line as a pull
 * quote and paragraphs 2+ as body copy. When owners paste everything into
 * paragraph 1 — common in the site editor — the remainder must still render.
 */
export function splitAboutPullQuote(text: string): {
  quote: string;
  bodyParagraphs: string[];
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { quote: DEFAULT_PULL_QUOTE, bodyParagraphs: [] };
  }

  const firstSentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
  if (!firstSentence) {
    if (trimmed.length <= MAX_PULL_QUOTE_LEN) {
      return { quote: trimmed, bodyParagraphs: [] };
    }
    return {
      quote: `${trimmed.slice(0, MAX_PULL_QUOTE_LEN - 4).trim()}...`,
      bodyParagraphs: [trimmed.slice(MAX_PULL_QUOTE_LEN - 4).trim()].filter(Boolean),
    };
  }

  const quote =
    firstSentence.length > MAX_PULL_QUOTE_LEN
      ? `${firstSentence.slice(0, MAX_PULL_QUOTE_LEN - 4).trim()}...`
      : firstSentence;
  const remainder = trimmed.slice(firstSentence.length).trim();

  return {
    quote,
    bodyParagraphs: remainder ? [remainder] : [],
  };
}

/** Merge paragraph-1 remainder with paragraphs 2+ for about body columns. */
export function buildAboutBodyParagraphs(paragraphs: string[]): string[] {
  const { bodyParagraphs: fromFirst } = splitAboutPullQuote(paragraphs[0] || "");
  const tail = paragraphs
    .slice(1)
    .map((p) => p.trim())
    .filter(Boolean);
  return [...fromFirst, ...tail];
}
