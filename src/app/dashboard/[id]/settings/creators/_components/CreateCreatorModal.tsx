// app/settings/creators/_components/CreateCreatorModal.tsx
"use client";

import { useEffect, useState } from "react";
import { CreatorModal } from "./CreatorModal";

type UserOption = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type Tier = { id: string; name: string; percent_off: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { profile_id: string; tier_id: string; code: string }) => Promise<void> | void;
};

export function CreateCreatorModal({ open, onClose, onCreate }: Props) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [profileId, setProfileId] = useState("");
  const [tierId, setTierId] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);

    fetch("/api/get-all-users")
      .then((res) => res.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]));

    fetch("/api/creator/tiers")
      .then((res) => res.json())
      .then((data) => {
        const list: Tier[] = data.tiers ?? [];
        setTiers(list);
        if (list.length > 0) setTierId((prev) => prev || list[0].id);
      })
      .catch(() => setTiers([]));
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    const c = code.trim().toUpperCase();

    if (!profileId) return setError("Pick a profile to make a creator.");
    if (!tierId) return setError("Pick a tier.");
    if (!c) return setError("Give them a discount code.");

    try {
      setSaving(true);
      await onCreate({ profile_id: profileId, tier_id: tierId, code: c });
      setProfileId("");
      setCode("");
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create creator.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreatorModal
      open={open}
      title="Make a creator"
      description="Pick an existing profile, assign a tier, and give them a code. The code goes live immediately."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Profile</label>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          >
            <option value="">Select a profile</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.email || u.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Tier</label>
          <select
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          >
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.percent_off}%
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Commission mirrors the discount: whatever a customer saves with this code is what the creator earns.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Discount code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="JORDAN15"
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-mono"
          />
        </div>

        {error && <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </CreatorModal>
  );
}
