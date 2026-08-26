import { GET as handler } from "@/app/auth/callback/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return handler(request);
}
