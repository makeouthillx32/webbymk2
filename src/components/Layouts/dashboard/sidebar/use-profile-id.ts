"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function useProfileId() {
  const pathname = usePathname();
  const [id, setId] = useState("me");

  useEffect(() => {
    const segments = pathname.split("/");
    const idx = segments.indexOf("dashboard");
    const maybeId = segments[idx + 1];
    if (maybeId) setId(maybeId);
  }, [pathname]);

  return id;
}