import { redirect } from "next/navigation";
import { getCurrentLocale, getStaticParams } from "@/locales/server";
import { setStaticParamsLocale } from "next-international/server";

export default async function NotFound() {
  const ehe = getStaticParams();

  setStaticParamsLocale("de");
  const locale = getCurrentLocale();

  redirect(`/error`);
}
