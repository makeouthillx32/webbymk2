"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function AdminUserManager() {
  const [uuid, setUuid] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  const handleDelete = async () => {
    const confirm = window.confirm(`Delete ${selectedUser?.display_name || uuid}?`);
    if (!confirm) return;

    setLoading(true);
    try {
      const res = await fetch("/api/profile/admin-delete-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid }),
      });

      if (res.ok) {
        setMessage("✅ Successfully deleted user and profile.");
        setUuid("");
        const refreshed = await fetch("/api/get-all-users");
        setUsers(await refreshed.json());
      } else {
        setMessage("❌ Deletion failed.");
      }
    } catch {
      setMessage("Unexpected error while deleting user.");
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-10 p-6 bg-white dark:bg-gray-900 shadow rounded-md">
      <h2 className="text-xl font-bold mb-4 text-center">Admin: Delete User</h2>

      <select
        className="w-full mb-4 p-2 rounded border bg-white dark:bg-zinc-800 text-black dark:text-white"
        value={uuid}
        onChange={(e) => setUuid(e.target.value)}
      >
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.display_name || user.id}
          </option>
        ))}
      </select>

      {uuid && selectedUser && (
        <div className="mb-4 border p-4 rounded bg-gray-100 dark:bg-zinc-800">
          <p><strong>Display Name:</strong> {selectedUser.display_name || "N/A"}</p>
          <p><strong>UUID:</strong> {selectedUser.id}</p>
        </div>
      )}

      {uuid && (
        <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 w-full" disabled={loading}>
          {loading ? "Deleting..." : "Delete User"}
        </Button>
      )}

      {message && <p className="text-center mt-4 text-sm">{message}</p>}
    </div>
  );
}
