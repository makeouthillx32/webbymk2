"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export default function InviteGenerator({ defaultRole = "client" }: { defaultRole?: string }) {
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
        <option value="admin">Admin</option>
        <option value="jobcoach">Job Coach</option> {/* updated */}
        <option value="client">Client</option>
        <option value="user">Anonymous</option>      {/* updated */}
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