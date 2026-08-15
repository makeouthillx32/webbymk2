import { redirect } from "next/navigation";

// Director is now the default view of the single persistent page (mode
// toggle in the header), not its own route. This stub exists only so old
// /director links still land somewhere real.
export default function DirectorRedirect() {
  redirect("/");
}
