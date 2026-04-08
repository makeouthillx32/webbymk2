"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteAccount() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const confirm = window.confirm("Are you sure you want to permanently delete your account?");
    if (!confirm) return;

    setLoading(true);
    const res = await fetch("/api/delete-account", { method: "DELETE" });

    if (res.ok) {
      router.push("/sign-in");
    } else {
      alert("Failed to delete account. Try again.");
    }

    setLoading(false);
  };

  return (
    <div className="w-full mt-8 text-center">
      <button
        onClick={handleDelete}
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        disabled={loading}
      >
        {loading ? "Deleting..." : "Delete My Account"}
      </button>
    </div>
  );
}

