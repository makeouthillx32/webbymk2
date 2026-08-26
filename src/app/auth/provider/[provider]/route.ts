import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildOAuthCallbackUrl, safePostAuthRedirect } from "@/lib/authRedirect";
import { CORE_DOMAIN } from "@/lib/multiZone";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OAuthProvider = "google" | "facebook";

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "facebook";
}

function signInFailureUrl(message: string, next: string | null) {
  const url = new URL("/sign-in", `https://auth.${CORE_DOMAIN}`);
  url.searchParams.set("error", message);
  if (next) url.searchParams.set("next", next);
  return url;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const requestUrl = new URL(request.url);
  const next = safePostAuthRedirect(requestUrl.searchParams.get("next"));

  if (!isOAuthProvider(provider)) {
    return NextResponse.redirect(signInFailureUrl("Unsupported sign-in provider.", next));
  }

  const publicSupabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!publicSupabaseUrl || !anonKey) {
    console.error("[auth/provider] Public Supabase configuration is missing.");
    return NextResponse.redirect(signInFailureUrl("Provider sign-in is temporarily unavailable.", next));
  }

  const cookieStore = await cookies();
  let pendingCookies: Array<{
    name: string;
    value: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any;
  }> = [];

  const supabase = createServerClient(publicSupabaseUrl, anonKey, {
    cookieOptions: {
      name: "sb-unenter-auth-token",
      domain: process.env.NODE_ENV === "production" ? `.${CORE_DOMAIN}` : undefined,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies = cookiesToSet;
      },
    },
  });

  try {
    const callbackUrl = buildOAuthCallbackUrl({
      currentOrigin: `https://auth.${CORE_DOMAIN}`,
      next,
    });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error || !data.url) {
      console.error("[auth/provider] OAuth initialization failed:", error?.message || "missing redirect URL");
      return NextResponse.redirect(signInFailureUrl("Could not start provider sign-in. Please try again.", next));
    }

    const destination = new URL(data.url);
    const expectedOrigin = new URL(publicSupabaseUrl).origin;
    if (destination.origin !== expectedOrigin) {
      console.error("[auth/provider] Refusing unexpected OAuth destination origin.");
      return NextResponse.redirect(signInFailureUrl("Could not start provider sign-in. Please try again.", next));
    }

    const response = NextResponse.redirect(destination);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        ...options,
        path: options?.path || "/",
        domain: process.env.NODE_ENV === "production"
          ? `.${CORE_DOMAIN}`
          : options?.domain,
        sameSite: options?.sameSite || "lax",
        secure: process.env.NODE_ENV === "production" || options?.secure,
      });
    });
    if (next) {
      response.cookies.set("unenter_oauth_return", encodeURIComponent(next), {
        path: "/",
        domain: process.env.NODE_ENV === "production" ? `.${CORE_DOMAIN}` : undefined,
        maxAge: 600,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      });
    }
    return response;
  } catch (error) {
    console.error("[auth/provider] OAuth initialization exception:", error);
    return NextResponse.redirect(signInFailureUrl("Could not start provider sign-in. Please try again.", next));
  }
}
