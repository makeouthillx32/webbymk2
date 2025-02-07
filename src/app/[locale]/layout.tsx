"use client";
import { ReactElement, Suspense } from "react";
import { I18nProviderClient } from "@/locales/client";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Loading from "@/components/Common/Loading";

const ScrollToTop = dynamic(() => import("@/components/ScrollToTop"), { ssr: false });

export default function SubLayout({
  children,
  params,
}: {
  children: ReactElement;
  params: { locale: string };
}) {
  return (
    <I18nProviderClient locale={params.locale} fallback={<Loading />}>
      {/* Load Main Content First */}
      {children}

      {/* Load Header and Footer Lazily */}
      <Suspense fallback={<Loading />}>
        <Header />
        <Footer />
      </Suspense>

      {/* Load ScrollToTop only when needed */}
      <ScrollToTop />
    </I18nProviderClient>
  );
}
