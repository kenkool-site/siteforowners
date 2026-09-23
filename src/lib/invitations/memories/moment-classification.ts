import type { DetectedLabel } from "./ai-provider";
import type { MemoryMoment } from "./repository";

// Maps a keyword that might appear in a host-typed Moment name (e.g. "Cake Cutting",
// "First Dance") to the AWS Rekognition DetectLabels vocabulary we'd expect a photo
// from that moment to trigger. This is a first-pass heuristic, not a verified mapping
// against real Rekognition output — AWS's label taxonomy shifts between model
// versions, and this hasn't been tuned against real event photos yet. Expect to
// revise this list once real classifications start coming back from live guest
// uploads. Keys are matched as case-insensitive substrings of the Moment's name, so
// "Cake" alone also matches a Moment named "Cake Cutting" or "The Cake Table."
const MOMENT_KEYWORD_PRESETS: Record<string, string[]> = {
  ceremony: ["Wedding", "Person", "Bride", "Groom", "Altar", "Church"],
  vows: ["Wedding", "Bride", "Groom", "Person"],
  altar: ["Wedding", "Altar", "Church", "Person"],
  aisle: ["Wedding", "Person"],
  reception: ["Food", "Restaurant", "Dining Table", "Person", "Meal"],
  dinner: ["Food", "Restaurant", "Dining Table", "Meal"],
  food: ["Food", "Meal", "Restaurant", "Dish"],
  toast: ["Person", "Glass", "Wine", "Crowd"],
  speech: ["Person", "Crowd", "Microphone", "Podium"],
  cake: ["Cake", "Dessert", "Food"],
  cutting: ["Cake", "Dessert", "Food"],
  dance: ["Dance Pose", "Person", "Party"],
  dancing: ["Dance Pose", "Person", "Party"],
  "dance floor": ["Dance Pose", "Person", "Party", "Crowd", "Lighting"],
  dj: ["Person", "Crowd", "Party", "Lighting"],
  party: ["Party", "Crowd", "Person", "Balloon"],
  bouquet: ["Flower Bouquet", "Flower", "Plant"],
  "first dance": ["Dance Pose", "Person"],
  "send off": ["Crowd", "Fireworks", "Night", "Sparkler"],
  sparkler: ["Fireworks", "Sparkler", "Night"],
  gift: ["Gift", "Person"],
  gifts: ["Gift", "Person"],
  present: ["Gift", "Person"],
  presents: ["Gift", "Person"],
  balloon: ["Balloon", "Party"],
  balloons: ["Balloon", "Party"],
  candle: ["Candle", "Cake"],
  candles: ["Candle", "Cake"],
};

function expectedLabelsForMomentName(name: string): string[] {
  const lowerName = name.toLowerCase();
  const matched = new Set<string>();
  for (const [keyword, labels] of Object.entries(MOMENT_KEYWORD_PRESETS)) {
    if (lowerName.includes(keyword)) {
      for (const label of labels) matched.add(label);
    }
  }
  return Array.from(matched);
}

/**
 * Scores each Moment by how many of a photo's detected Rekognition labels overlap
 * with the labels we'd expect for that Moment's name (per the preset dictionary
 * above), weighted by detection confidence. Returns the highest-scoring Moment with
 * a nonzero score, or null if no Moment's name matched any preset keyword, or none
 * of the photo's detected labels overlapped with any matched Moment's expected set.
 */
export function classifyMomentFromLabels(detectedLabels: DetectedLabel[], moments: MemoryMoment[]): MemoryMoment | null {
  if (detectedLabels.length === 0 || moments.length === 0) return null;

  let best: MemoryMoment | null = null;
  let bestScore = 0;
  for (const moment of moments) {
    const expected = expectedLabelsForMomentName(moment.name);
    if (expected.length === 0) continue;
    const expectedLower = new Set(expected.map((label) => label.toLowerCase()));
    const score = detectedLabels.reduce(
      (sum, label) => sum + (expectedLower.has(label.name.toLowerCase()) ? label.confidence : 0),
      0,
    );
    if (score > bestScore) {
      best = moment;
      bestScore = score;
    }
  }
  return best;
}
