"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function ManualRoleEditor() {
  const [uuid, setUuid] = useState("");
  const [role, setRole] = useState("client");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchAllUsers = async () => {
      const res = await fetch("/api/get-all-users");
      const data = await res.json();
      if (res.ok) setUsers(data);
    };
    fetchAllUsers();
  }, []);

  const selectedUser = users.find((user) => user.id === uuid);

  const handleUpdateRole = async () => {
    if (!uuid || !role) return;
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/profile/set-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid, role }),
    });

    const result = await res.json();
    if (res.ok) {
      setMessage(`✅ Role updated to '${role}' for user ${selectedUser?.display_name}.`);
    } else {
      setMessage(`❌ ${result.error || "Failed to update role."}`);
    }

    setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white dark:bg-zinc-800 p-6 rounded shadow">
      <h2 className="text-xl font-bold mb-4 text-center">Manually Set User Role</h2>

      <Label htmlFor="user">Select User</Label>
      <select
        id="user"
        className="w-full mb-4 p-2 rounded border bg-white dark:bg-zinc-700 text-black dark:text-white"
        value={uuid}
        onChange={(e) => setUuid(e.target.value)}
      >
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.display_name || user.email || user.id}
          </option>
        ))}
      </select>

      <Label htmlFor="role">Role</Label>
      <select
        id="role"
        className="w-full mb-4 p-2 rounded border bg-white dark:bg-zinc-700 text-black dark:text-white"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        <option value="admin">Admin</option>
        <option value="jobcoach">Job Coach</option> {/* FIXED */}
        <option value="client">Client</option>
        <option value="user">User</option>
      </select>

      <Button onClick={handleUpdateRole} disabled={loading} className="w-full">
        {loading ? "Updating..." : "Update Role"}
      </Button>

      {message && <p className="text-center mt-4 text-sm">{message}</p>}
    </div>
  );
}