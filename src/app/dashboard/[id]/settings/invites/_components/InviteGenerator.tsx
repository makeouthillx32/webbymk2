"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { VALID_ROLES } from "@/actions/auth/types";

export default function InviteGenerator({
  defaultRole = "member",
  onCreated,
}: {
  defaultRole?: string;
  onCreated?: () => void;
}) {
  const [role, setRole] = useState(defaultRole);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerateInvite = async () => {
    setLoading(true);
    setInviteLink("");
    setCopied(false);

    const res = await fetch("/api/invite/create", {
      method: "POST",
      body: JSON.stringify({ role }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    if (data.inviteLink) {
      setInviteLink(data.inviteLink);
      // Row for this invite is now live in the invites table, but the list
      // behind this modal was fetched before it existed and never refetches
      // on its own — the modal used to just sit there showing a link that
      // wasn't reflected in "Active Invite Links" until a manual reload.
      onCreated?.();
    }

    setLoading(false);
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-card text-card-foreground p-6 rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Generate Invite Link</h2>

      <label className="block mb-2 font-medium">Select Role:</label>
      <select
        className="w-full mb-4 p-2 rounded border"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {/* Options come from VALID_ROLES — the same list both redemption
            paths (sign-up and apply-invite) actually honor. This used to be
            a separately hand-maintained list that included "affiliate",
            which neither path could ever grant: minting one produced an
            invite link that silently downgraded to "member" on signup. */}
        {VALID_ROLES.map((r) => (
          <option key={r} value={r}>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </option>
        ))}
      </select>

      <button
        onClick={handleGenerateInvite}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
        disabled={loading}
      >
        {loading ? "Generating..." : "Generate Invite"}
      </button>

      {inviteLink && (
        <div className="mt-4">
          <label className="mb-1 font-medium flex items-center justify-between">
            Invite Link:
            <button
              onClick={handleCopy}
              className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
              title={copied ? "Copied!" : "Copy to clipboard"}
            >
              <Copy size={18} />
              {copied && <span className="text-xs">Copied!</span>}
            </button>
          </label>

          <input
            readOnly
            value={inviteLink}
            className="w-full p-2 border rounded bg-background"
          />
        </div>
      )}
    </div>
  );
}