"use client";
import { ReactElement } from "react";
import { I18nProviderClient } from "@/locales/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollToTop from "@/components/ScrollToTop";
import Loading from "@/components/Common/Loading";

export default function SubLayout({
  children,
  params,
}: {
  children: ReactElement;
  params: { locale: string };
}) {
  return (
    <I18nProviderClient locale={params.locale} fallback={<Loading />}>
      <Header />
      {children}
      <ScrollToTop />
      <Footer />
    </I18nProviderClient>
  );
}
