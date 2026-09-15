"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";

const MESSAGES = { en: enMessages, es: esMessages } as const;

export function InvitationPublicProvider({
  locale,
  timeZone,
  children,
}: {
  locale: "en" | "es";
  timeZone: string;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      timeZone={timeZone}
      now={new Date(0)}
      formats={{}}
    >
      {children}
    </NextIntlClientProvider>
  );
}
