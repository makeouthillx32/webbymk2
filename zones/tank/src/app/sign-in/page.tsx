import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TankSignInRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const targetNext = params?.next || "https://tank.unenter.live/";
  redirect(`https://auth.unenter.live/sign-in?next=${encodeURIComponent(targetNext)}`);
}
