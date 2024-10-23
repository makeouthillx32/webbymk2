import { cn } from "@/utils/cn";

export default function Loading() {
  return (
    <section
      className={cn("animate-pulse text-center text-6xl", "mx-auto size-full")}
    >
      Loading...
    </section>
  );
}
