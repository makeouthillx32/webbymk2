import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import ProfileCard from "@/components/profile/ProfileCard";
export async function generateMetadata(): Promise<Metadata> { return { title: "Profile" }; }
interface ProfilePageProps { params: Promise<{ id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }>; }
export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { id: idParam } = await params;
  await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.includes(":") ? "http" : "https");
  const baseUrl = host ? `${proto}://${host}` : "";
  const c = await cookies();
  const cookieHeader = c.toString();
  const profileRes = await fetch(`${baseUrl}/api/profile`, { cache: "no-store", headers: { cookie: cookieHeader } });
  const profile = await profileRes.json().catch(() => null);
  if (!profileRes.ok || !profile?.id) {
    return <div className="text-center py-10 text-red-600">User not found or unauthorized.</div>;
  }
  const realId = idParam === "me" ? profile.id : idParam;
  if (profile.id !== realId) return redirect("/profile/me");
  const roleLabel = typeof profile.role === "string" && profile.role.length > 0 ? profile.role : "member";
  const displayName = typeof profile.display_name === "string" && profile.display_name.trim().length > 0 ? profile.display_name.trim() : "Member";
  return <div className="max-w-6xl mx-auto px-6 py-12 space-y-8"><ProfileCard profile={profile} displayName={displayName} roleLabel={roleLabel} /></div>;
}
