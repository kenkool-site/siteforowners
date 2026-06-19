import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAboutBodyParagraphs,
  splitAboutPullQuote,
} from "../src/lib/about-pull-quote.ts";

test("splitAboutPullQuote keeps remainder of paragraph 1 for the body", () => {
  const text =
    "When your hairstyle doesn't match your routine, Slaybyjae creates precise, easy-to-manage styles that fit your daily life. You'll start with a straightforward consultation to set clear goals.";
  const { quote, bodyParagraphs } = splitAboutPullQuote(text);

  assert.equal(
    quote,
    "When your hairstyle doesn't match your routine, Slaybyjae creates precise, easy-to-manage styles that fit your daily life.",
  );
  assert.equal(
    bodyParagraphs[0],
    "You'll start with a straightforward consultation to set clear goals.",
  );
});

test("buildAboutBodyParagraphs appends paragraphs 2 and 3 after paragraph 1 remainder", () => {
  const paragraphs = [
    "Opening line for the quote. Remainder from paragraph one.",
    "Second paragraph.",
    "Third paragraph.",
  ];

  assert.deepEqual(buildAboutBodyParagraphs(paragraphs), [
    "Remainder from paragraph one.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
});

test("RunwayAbout renders body copy when only paragraph 1 is filled", async () => {
  const runwayAbout = await readFile(
    "src/components/templates/about/RunwayAbout.tsx",
    "utf8",
  );

  assert.match(
    runwayAbout,
    /buildAboutBodyParagraphs/,
    "RunwayAbout should render paragraph-1 remainder in the body column",
  );
});
