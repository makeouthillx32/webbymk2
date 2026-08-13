// app/settings/mail/_components/BoxesPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Power, KeyRound, Sparkles } from "lucide-react";
import { LoadingState } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";
import { CreateBoxModal } from "./CreateBoxModal";
import { SetupResultsPanel } from "./SetupResultsPanel";
import { generatePassword } from "./generatePassword";

type Box = { email: string; name?: string; disabled?: boolean };

// The four mail branches the app knows about (src/lib/mail/identities.ts).
// "Set up standard mailboxes" creates whichever of these don't exist yet.
const STANDARD_MAILBOXES: { local: string; name: string }[] = [
  { local: "support", name: "unenter.live Support" },
  { local: "labs", name: "Unenter Labs" },
  { local: "admin", name: "unenter.live Admin" },
  { local: "auth", name: "unenter.live Auth" },
];

type SetupResult = {
  email: string;
  status: "created" | "exists" | "error";
  password?: string;
  error?: string;
};

export function BoxesPanel() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupResults, setSetupResults] = useState<SetupResult[] | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mail-server/boxes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load mailboxes");
      setBoxes(data.boxes ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (data: { email: string; passwordPlaintext: string; name?: string }) => {
    const res = await fetch("/api/mail-server/boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Failed to create mailbox");
    await load();
  };

  const toggleDisabled = async (box: Box) => {
    setErr(null);
    const res = await fetch(`/api/mail-server/boxes/${encodeURIComponent(box.email)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: !box.disabled }),
    });
    const result = await res.json();
    if (!res.ok) {
      setErr(result.error ?? "Failed to update mailbox");
      return;
    }
    await load();
  };

  const resetPassword = async (box: Box) => {
    const newPassword = generatePassword();
    const ok = window.confirm(
      `Reset password for ${box.email}?\n\nNew password will be:\n${newPassword}\n\nCopy it before confirming — it won't be shown again.`
    );
    if (!ok) return;

    setErr(null);
    const res = await fetch(`/api/mail-server/boxes/${encodeURIComponent(box.email)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordPlaintext: newPassword }),
    });
    const result = await res.json();
    if (!res.ok) {
      setErr(result.error ?? "Failed to reset password");
      return;
    }
    window.alert(`Password reset. New password:\n\n${newPassword}`);
  };

  const domain = "unenter.live";

  const setupStandardMailboxes = async () => {
    setSettingUp(true);
    setErr(null);
    const results: SetupResult[] = [];

    for (const { local, name } of STANDARD_MAILBOXES) {
      const email = `${local}@${domain}`;
      const alreadyExists = boxes.some((b) => b.email.toLowerCase() === email.toLowerCase());
      if (alreadyExists) {
        results.push({ email, status: "exists" });
        continue;
      }

      const password = generatePassword();
      try {
        const res = await fetch("/api/mail-server/boxes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, passwordPlaintext: password, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create");
        results.push({ email, status: "created", password });
      } catch (e: any) {
        results.push({ email, status: "error", error: e.message ?? "Failed to create" });
      }
    }

    setSetupResults(results);
    setSettingUp(false);
    await load();
  };

  const remove = async (box: Box) => {
    const ok = window.confirm(`Delete ${box.email}? This can't be undone.`);
    if (!ok) return;

    setErr(null);
    const res = await fetch(`/api/mail-server/boxes/${encodeURIComponent(box.email)}`, { method: "DELETE" });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(result.error ?? "Failed to delete mailbox");
      return;
    }
    await load();
  };

  if (loading) return <LoadingState label="Loading mailboxes..." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={settingUp}
          onClick={setupStandardMailboxes}
          title="Creates support@, labs@, admin@, and auth@unenter.live — skips any that already exist"
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 text-sm hover:bg-[hsl(var(--muted))] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {settingUp ? "Setting up..." : "Set up standard mailboxes"}
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-3 text-sm text-[hsl(var(--primary-foreground))]"
        >
          <Plus className="h-3.5 w-3.5" /> Create mailbox
        </button>
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {setupResults && (
        <SetupResultsPanel results={setupResults} onClose={() => setSetupResults(null)} />
      )}

      {boxes.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          No mailboxes yet. Create admin@, support@, and labs@ to get order/system email working.
        </div>
      ) : (
        <div className="space-y-2">
          {boxes.map((box) => (
            <div
              key={box.email}
              className="flex items-center justify-between rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-semibold text-[hsl(var(--foreground))]">
                  {box.email}
                  {box.disabled && (
                    <span className="ml-2 rounded-full bg-[hsl(var(--destructive))]/10 px-2 py-0.5 text-xs font-normal text-[hsl(var(--destructive))]">
                      disabled
                    </span>
                  )}
                </p>
                {box.name && <p className="text-xs text-[hsl(var(--muted-foreground))]">{box.name}</p>}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Reset password"
                  onClick={() => resetPassword(box)}
                  className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={box.disabled ? "Enable" : "Disable"}
                  onClick={() => toggleDisabled(box)}
                  className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => remove(box)}
                  className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
                >
                  <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateBoxModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
    </div>
  );
}
