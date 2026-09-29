// app/dashboard/[id]/settings/invites/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ShowcaseSection } from '@/components/Layouts/dashboard/sidebar/showcase-section';
import InviteGeneratorClient from './_components/InviteGeneratorClient';
import './_components/invites.scss';

interface Invite {
  code: string;
  role: string;               // role_id — already the plain role name (see api/invite/route.ts)
  inviter: {
    name: string | null;
    avatar: string;
  };
  expires_at: string | null;
}

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  // Fetch invites
  const loadInvites = async () => {
    setLoading(true);
    const res = await fetch('/api/invite');
    if (!res.ok) {
      console.error('Failed to load invites:', await res.text());
      setInvites([]);
    } else {
      setInvites(await res.json());
    }
    setLoading(false);
  };
  useEffect(() => { loadInvites(); }, []);

  // Create invite overlay
  const openGenerator = () => setShowGenerator(true);

  // Delete invite
  const handleDelete = async (code: string) => {
    if (!confirm('Revoke this invite?')) return;
    setDeletingCode(code);
    const res = await fetch(`/api/invite/${code}`, { method: 'DELETE' });
    if (!res.ok) {
      console.error('Failed to delete invite:', await res.text());
    } else {
      setInvites((prev) => prev.filter((i) => i.code !== code));
    }
    setDeletingCode(null);
  };

  // Was `handleCreate(newInvite: Invite)` — dead code, never passed to
  // InviteGeneratorClient, and its shape didn't match what /api/invite/create
  // even returns (just an inviteLink, no role/inviter/expires_at). The modal
  // stays open on creation (so the link stays visible to copy); this just
  // makes sure the row shows up once it does.
  const handleCreated = () => {
    loadInvites();
  };

  return (
    <ShowcaseSection title="Invite Management">
      <div className="invites-page">
        <div className="invites-header">
          <h2>Active Invite Links</h2>
          <button onClick={openGenerator} className="btn-create" disabled={creating}>
            Create Invite
          </button>
        </div>

        <div className="invites-table">
          <div className="table-header grid grid-cols-5 gap-4 p-3">
            <div>Role</div>
            <div>Inviter</div>
            <div>Invite Code</div>
            <div>Expires</div>
            <div></div>
          </div>

          {loading ? (
            <div className="loading p-4 text-center">Loading…</div>
          ) : invites.length === 0 ? (
            <div className="empty p-4 text-center text-gray-500">No invites yet.</div>
          ) : (
            invites.map((inv) => {
              const displayName = inv.inviter.name ?? 'Unknown';
              const isDeleting = deletingCode === inv.code;
              return (
                <div key={inv.code} className="invite-row grid grid-cols-5 gap-4 items-center p-3 border-t hover:bg-gray-50">
                  <div className="capitalize font-medium">{inv.role}</div>

                  <div className="flex items-center space-x-2">
                    <img src={inv.inviter.avatar} alt={displayName} className="w-8 h-8 rounded-full" />
                    <div className="text-sm font-medium">{displayName}</div>
                  </div>

                  <div className="font-mono">{inv.code}</div>

                  <div>
                    {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never'}
                  </div>

                  <button
                    onClick={() => handleDelete(inv.code)}
                    disabled={isDeleting}
                    className="btn-delete p-2 rounded-full hover:bg-red-50"
                  >
                    {isDeleting ? '…' : <X size={18} className="text-red-500" />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {showGenerator && (
          <div className="generator-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="generator-modal relative bg-white rounded-lg p-6 max-w-md w-full shadow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <button className="absolute top-3 right-3 text-gray-600 hover:text-gray-800" onClick={() => setShowGenerator(false)}>
                <X size={24} />
              </button>
              <InviteGeneratorClient defaultRole="member" onCreated={handleCreated} />
            </div>
          </div>
        )}
      </div>
    </ShowcaseSection>
  );
}
