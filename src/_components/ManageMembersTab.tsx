import React, { useState, useEffect } from "react";
import { Search, Users, AlertTriangle, X, User, Info } from "lucide-react";

// Member interface
interface RoleMember {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
}

interface MembersApiResponse {
  role: string;
  members: Array<{
    id?: string | null;
    name?: string;
    email?: string;
    avatar_url?: string | null;
    role?: string | null;
  }>;
  meta?: any;
}

interface ManageMembersTabProps {
  roleId: string; // kept for compatibility with parent, not used for fetching anymore
  roleName: string; // expected: "admin" | "member" | "guest"
  onRemoveMember: (userId: string) => Promise<void>;
  onAddClick: () => void;
}

export default function ManageMembersTab({
  roleId, // unused for fetch now
  roleName,
  onRemoveMember,
  onAddClick,
}: ManageMembersTabProps) {
  const [members, setMembers] = useState<RoleMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!roleName) {
      setIsLoading(false);
      setError("No role name provided");
      return;
    }

    const fetchMembers = async () => {
      setIsLoading(true);
      setError(null);
      setDebugInfo(null);

      try {
        console.log(`Fetching members for roleName: ${roleName} (roleId ignored: ${roleId})`);

        const url = `/api/roles/members?role=${encodeURIComponent(roleName)}`;
        const res = await fetch(url);

        const responseText = await res.text();
        console.log(`Raw API response (${res.status}): ${responseText}`);
        setDebugInfo(`GET ${url}\nStatus: ${res.status}\n\n${responseText}`);

        if (!res.ok) {
          // try to parse error payload
          try {
            const errJson = JSON.parse(responseText);
            throw new Error(errJson?.error || `Failed to fetch role members: ${res.status}`);
          } catch {
            throw new Error(`Failed to fetch role members: ${res.status}`);
          }
        }

        let data: MembersApiResponse;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          throw new Error("Invalid response format");
        }

        const membersArray = Array.isArray((data as any)?.members) ? data.members : [];

        const normalizedMembers: RoleMember[] = membersArray.map((m) => ({
          id: (m as any).id || "",
          name: (m as any).name || "Unknown User",
          email: (m as any).email || "",
          avatar_url: (m as any).avatar_url || null,
        }));

        setMembers(normalizedMembers);

        // Special UX for guest
        if (roleName === "guest" && normalizedMembers.length === 0) {
          setError(null);
        }
      } catch (err) {
        console.error("Error fetching role members:", err);
        setError(
          `Failed to load role members: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        setMembers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [roleName, roleId]);

  // Filter members based on search query
  const filteredMembers = members.filter(
    (member) =>
      searchQuery === "" ||
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRemoveMember = async (userId: string) => {
    try {
      await onRemoveMember(userId);
      setMembers((currentMembers) =>
        currentMembers.filter((member) => member.id !== userId)
      );
    } catch (err) {
      console.error("Error removing member:", err);
      setError(
        `Failed to remove member: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const emptyMessage =
    roleName === "guest"
      ? "Guests are anonymous visitors (not stored as user accounts)."
      : error
      ? "Unable to load members"
      : "No members assigned to this role.";

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-4 border-b border-[hsl(var(--border))]">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
            size={18}
          />
          <input
            type="text"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border border-[hsl(var(--input))] rounded-[var(--radius)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))]"
          />
        </div>
      </div>

      {/* Debug info */}
      {debugInfo && process.env.NODE_ENV !== "production" && (
        <div className="p-3 bg-[hsl(var(--chart-4))/0.1] border-b border-[hsl(var(--chart-4))/0.2]">
          <div className="flex items-start">
            <Info
              className="mr-2 flex-shrink-0 text-[hsl(var(--chart-4))]"
              size={18}
            />
            <div className="text-xs font-[var(--font-mono)] text-[hsl(var(--chart-4))] overflow-x-auto">
              <p>Debug info:</p>
              <pre>{debugInfo}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-3 bg-[hsl(var(--destructive))/0.1] border-b border-[hsl(var(--destructive))/0.2]">
          <div className="flex items-start">
            <AlertTriangle
              className="mr-2 flex-shrink-0 text-[hsl(var(--destructive))]"
              size={18}
            />
            <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--sidebar-primary))] border-t-transparent rounded-full"></div>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-6 text-center text-[hsl(var(--muted-foreground))]">
            <Users size={48} className="mx-auto mb-4 opacity-30" />
            <p>{emptyMessage}</p>

            {/* Don’t show “Add Members” for guest role */}
            {roleName !== "guest" && (
              <button
                onClick={onAddClick}
                className="mt-4 px-4 py-2 bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] rounded-[var(--radius)] hover:bg-[hsl(var(--sidebar-primary))/0.9]"
              >
                Add Members
              </button>
            )}
          </div>
        ) : (
          <div>
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 hover:bg-[hsl(var(--accent))]"
              >
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden mr-3">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User
                        size={20}
                        className="text-[hsl(var(--muted-foreground))]"
                      />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-[hsl(var(--foreground))]">
                      {member.name}
                    </div>
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {member.email}
                    </div>
                  </div>
                </div>

                {roleName !== "guest" && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="ml-2 p-1 rounded-full hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    title="Remove from role"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex justify-between items-center">
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} in{" "}
          {roleName}
        </div>

        {roleName !== "guest" && (
          <button
            onClick={onAddClick}
            className="px-4 py-2 bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] rounded-[var(--radius)] hover:bg-[hsl(var(--sidebar-primary))/0.9] shadow-[var(--shadow-xs)]"
          >
            Add Members
          </button>
        )}
      </div>
    </div>
  );
}
