import { redirect } from "next/navigation";

// Superseded by /stream's Creator Dashboard (Stream URL & Key tab) —
// redirect rather than delete so any existing bookmarks/links keep working.
export default function Page() {
  redirect("/stream");
}
