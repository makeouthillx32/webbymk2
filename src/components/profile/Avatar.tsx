"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, X } from "lucide-react";
import { createPortal } from "react-dom";

export default function Avatar({
  userId,
  role,
  avatarUrl,
}: {
  userId: string;
  role?: string;
  avatarUrl?: string | null;
}) {
  const [showPreview, setShowPreview] = useState(false);

  const src = useMemo(() => {
    const v = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
    return v.length > 0 ? v : null;
  }, [avatarUrl]);

  if (!src) return null;

  return (
    <div className="relative flex flex-col items-center gap-4">
      <img
        src={src}
        alt="User Avatar"
        width={128}
        height={128}
        className="rounded-full border-4 border-gray-300 dark:border-zinc-700 object-cover w-32 h-32 cursor-pointer"
        onClick={() => setShowPreview(true)}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />

      {role && (
        <BadgeCheck className="absolute bottom-0 right-0 h-6 w-6 text-green-500 bg-white rounded-full p-1" />
      )}

      {showPreview &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setShowPreview(false)}
          >
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <img
                src={src}
                alt="Full Avatar"
                width={512}
                height={512}
                className="rounded-xl object-contain max-h-[90vh] max-w-[90vw]"
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
              />

              <button
                title="Close image preview"
                aria-label="Close image preview"
                className="absolute top-2 right-2 bg-white rounded-full p-1 text-black"
                onClick={() => setShowPreview(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}