"use client";

import { useState, useEffect } from "react";

/**
 * Time-of-day greeting based on the BROWSER's local clock — the server
 * is UTC and would say "Good afternoon" to an East Coast owner at 10am.
 *
 * Renders a generic "Hello" during SSR/initial paint, then swaps to the
 * real greeting after hydration. Avoids a flash of wrong content.
 */
export function Greeting({ name }: { name: string }) {
  const [phrase, setPhrase] = useState("Hello");

  useEffect(() => {
    const h = new Date().getHours();
    setPhrase(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <>
      {phrase}, {name}
    </>
  );
}
