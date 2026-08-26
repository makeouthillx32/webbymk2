// app/settings/mail/_components/CreateBoxModal.tsx
"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { generatePassword } from "./generatePassword";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { email: string; passwordPlaintext: string; name?: string }) => Promise<void> | void;
};

export function CreateBoxModal({ open, onClose, onCreate }: Props) {
  const [local, setLocal] = useState("");
  const [domain, setDomain] = useState("unenter.live");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setLocal("");
      setName("");
      setPassword(generatePassword());
      setError(null);
      setCreated(false);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const email = `${local.trim().toLowerCase()}@${domain}`;

  const submit = async () => {
    if (!local.trim()) return setError("Mailbox name is required (the part before the @).");
    setError(null);
    setSaving(true);
    try {
      await onCreate({ email, passwordPlaintext: password, name: name.trim() || undefined });
      setCreated(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to create mailbox.");
    } finally {
      setSaving(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-80">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/50" />

      <div className="absolute left-1/2 top-1/2 w-[calc(100%-24px)] max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
              {created ? "Mailbox created" : "Create mailbox"}
            </h2>
            <button onClick={onClose} className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            {created ? (
              <>
                <p className="text-sm text-[hsl(var(--foreground))]">
                  <span className="font-mono font-semibold">{email}</span> is live. Copy this password now —
                  poste.io won't show it again:
                </p>
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2">
                  <code className="flex-1 truncate text-sm">{password}</code>
                  <button onClick={copy} className="rounded-[var(--radius)] p-1 hover:bg-[hsl(var(--background))]">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  If this is support@ or labs@, use these as SMTP_USER / SMTP_PASS (or the
                  per-mailbox equivalents) in your .env.
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={onClose}
                    className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))]"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-[hsl(var(--foreground))]">Email</label>
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      value={local}
                      onChange={(e) => setLocal(e.target.value)}
                      placeholder="labs"
                      className="h-10 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-mono"
                    />
                    <span>@</span>
                    <input
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="h-10 w-40 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-[hsl(var(--foreground))]">Display name (optional)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Unenter Labs"
                    className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-[hsl(var(--foreground))]">Password</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(generatePassword())}
                      className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 text-sm hover:bg-[hsl(var(--muted))]"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>

                {error && <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={onClose} className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm">
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    onClick={submit}
                    className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
