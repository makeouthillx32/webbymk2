"use client";
import { ReactElement } from "react";
import { I18nProviderClient } from "@/locales/client";

export default function SubLayout({
  children,
  params,
}: {
  children: ReactElement;
  params: { locale: string };
}) {
  return (
    <I18nProviderClient locale={params.locale} fallback={<p>Loading...</p>}>
      {children}
    </I18nProviderClient>
  );
}
