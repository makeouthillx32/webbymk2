// app/dashboard/[id]/settings/invites/_components/InviteGeneratorClient.tsx
"use client";

import InviteGenerator from "./InviteGenerator";

export default function InviteGeneratorClient({
  defaultRole = "member",
  onCreated,
}: {
  defaultRole?: string;
  onCreated?: () => void;
}) {
  return (
    <div className="w-full mt-10">
      <InviteGenerator defaultRole={defaultRole} onCreated={onCreated} />
    </div>
  );
}
