// app/components/invite/InviteGeneratorClient.tsx
"use client";

import InviteGenerator from "./InviteGenerator";

export default function InviteGeneratorClient({ defaultRole = "client" }: { defaultRole?: string }) {
  return (
    <div className="w-full mt-10">
      <InviteGenerator defaultRole={defaultRole} />
    </div>
  );
}
