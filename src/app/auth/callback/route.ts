import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { safePostAuthRedirect } from "@/lib/authRedirect";
import { CORE_DOMAIN } from "@/lib/multiZone";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AUTH_EXCHANGE_DEADLINE_MS = 10_000;
const OAUTH_PROVISION_DEADLINE_MS = 8_000;

async function withDeadline<T>(work: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function provisionOAuthUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User,
  urlInvite: string | null,
) {
  const userId = user.id;
  const metaInvite = user.user_metadata?.invite;
  const inviteCode = metaInvite || urlInvite;

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from("profiles").insert({
      id: userId,
      auth_user_id: userId,
      email: user.email ?? null,
      role: "member",
      terms_accepted_at: new Date().toISOString(),
    });

    if (user.email) {
      await supabase.from("customers").upsert(
        {
          auth_user_id: userId,
          email: user.email.toLowerCase().trim(),
          type: "member",
          guest_key: null,
          claimed_at: new Date().toISOString(),
        },
        { onConflict: "auth_user_id" },
      );
    }
  }

  if (inviteCode) {
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("role_id")
      .eq("code", inviteCode)
      .maybeSingle();

    if (!inviteError && invite?.role_id) {
      await supabase.from("profiles").update({ role: invite.role_id }).eq("id", userId);
      await supabase.from("invites").delete().eq("code", inviteCode);
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.display_name) {
    const defaultName = user.email?.split("@")[0];
    if (defaultName) {
      await supabase.from("profiles").update({ display_name: defaultName }).eq("id", userId);
    }
  }
}

function getPublicOrigin(request: Request, requestUrl: URL) {
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const host = first(request.headers.get("x-forwarded-host"))
    || first(request.headers.get("host"))
    || requestUrl.host;
  const proto = first(request.headers.get("x-forwarded-proto"))
    || (host.endsWith(`.${CORE_DOMAIN}`) || host === CORE_DOMAIN ? "https" : requestUrl.protocol.replace(":", ""));
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = getPublicOrigin(request, requestUrl);
  try {
    const code = requestUrl.searchParams.get("code");
    const urlInvite = requestUrl.searchParams.get("invite");
    const cookieStore = await cookies();
    const returnCookie = cookieStore.get("unenter_oauth_return")?.value;
    const resolvedReturn = safePostAuthRedirect(returnCookie ? decodeURIComponent(returnCookie) : null);
    const redirectTo =
      safePostAuthRedirect(
        requestUrl.searchParams.get("redirect_to") ||
        requestUrl.searchParams.get("next")
      ) || resolvedReturn || "/";

    if (code) {
      try {
        const supabase = await createClient();
        const { data, error } = await withDeadline(
          supabase.auth.exchangeCodeForSession(code),
          AUTH_EXCHANGE_DEADLINE_MS,
          "OAuth session exchange",
        );

        if (error) {
          console.error("[auth/callback] ❌ exchangeCodeForSession failed:", error.message);
          return NextResponse.redirect(
            new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, publicOrigin)
          );
        }

        if (data.user) {
          const user = data.user;
          after(async () => {
            try {
              await withDeadline(
                provisionOAuthUser(supabase, user, urlInvite),
                OAUTH_PROVISION_DEADLINE_MS,
                "OAuth profile provisioning",
              );
            } catch (provisionError) {
              console.error("[auth/callback] deferred profile provisioning failed:", provisionError);
            }
          });
        }
      } catch (innerErr) {
        console.error("[auth/callback] session/db exception:", innerErr);
      }
    }

    const destination = new URL(redirectTo, publicOrigin);
    const response = NextResponse.redirect(destination);
    if (returnCookie) {
      response.cookies.set("unenter_oauth_return", "", {
        path: "/",
        domain: `.${CORE_DOMAIN}`,
        maxAge: 0,
      });
    }
    return response;
  } catch (err) {
    console.error("[auth/callback] fatal GET exception:", err);
    return NextResponse.redirect(new URL("/", publicOrigin));
  }
}
