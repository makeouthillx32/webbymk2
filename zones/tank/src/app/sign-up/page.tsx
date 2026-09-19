import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TankSignUpRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const targetNext = params?.next || "https://tank.unenter.live/";
  redirect(`https://auth.unenter.live/sign-up?next=${encodeURIComponent(targetNext)}`);
}
