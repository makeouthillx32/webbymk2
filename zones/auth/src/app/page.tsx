// zones/auth/src/app/page.tsx
// Root of auth.unenter.live — redirect straight to sign-in.
// All actual auth pages live in src/app/(auth-pages)/ from the shared core.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/sign-in");
}
