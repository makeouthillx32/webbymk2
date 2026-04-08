"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole"; // Make sure the path is correct

// Define interfaces for better type safety
interface User {
  id: string;
  role?: string;
  display_name?: string;
  email?: string;
}

interface Specialization {
  id: string;
  name: string;
  role: string;
}

export default function ManageSpecializations() {
  const [uuid, setUuid] = useState("");
  const { role, isLoading: isRoleLoading, error: roleError } = useUserRole(uuid);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  
  const [allSpecializations, setAllSpecializations] = useState<Specialization[]>([]);
  const [userSpecializations, setUserSpecializations] = useState<Specialization[]>([]);
  const [selectedSpecialization, setSelectedSpecialization] = useState("");
  const [availableSpecializations, setAvailableSpecializations] = useState<Specialization[]>([]);

  // Fetch all users
  useEffect(() => {
    fetch("/api/get-all-users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(error => {
        console.error("Error fetching users:", error);
        setMessage(`❌ Failed to fetch users: ${error.message}`);
      });
  }, []);

  // Fetch all specializations
  useEffect(() => {
    fetch("/api/profile/specializations/get-all")
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch specializations');
        }
        return res.json();
      })
      .then((data: Specialization[]) => {
        console.log("ALL SPECIALIZATIONS FETCHED:", data);
        setAllSpecializations(data);
      })
      .catch(error => {
        console.error("Error fetching specializations:", error);
        setMessage(`❌ Failed to fetch specializations: ${error.message}`);
      });
  }, []);

  // Fetch user specializations when UUID changes
  useEffect(() => {
    if (uuid) {
      fetchUserSpecializations();
    } else {
      setUserSpecializations([]);
    }
  }, [uuid]);

  // Filter available specializations based on role
  useEffect(() => {
    if (role && allSpecializations.length > 0) {
      const roleSpecializations = allSpecializations.filter(
        (spec) => spec.role.toLowerCase() === role.toLowerCase()
      );
      
      console.log("Role Specializations:", roleSpecializations);
      
      setAvailableSpecializations(roleSpecializations);
    }
  }, [role, allSpecializations]);

  // Fetch user specializations
  const fetchUserSpecializations = async () => {
    try {
      const res = await fetch(`/api/profile/specializations/get-user-specializations?userId=${uuid}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch user specializations');
      }
      
      const data = await res.json();
      console.log("USER SPECIALIZATIONS FETCHED:", data);
      setUserSpecializations(data);
    } catch (error: any) {
      console.error("Failed to fetch user specializations:", error);
      setMessage(`❌ Failed to fetch user specializations: ${error.message}`);
    }
  };

  // Add specialization handler
  const handleAddSpecialization = async () => {
    if (!uuid || !selectedSpecialization) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile/specializations/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uuid,
          specializationId: selectedSpecialization,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        const specName = allSpecializations.find(
          (spec) => spec.id === selectedSpecialization
        )?.name || selectedSpecialization;

        setMessage(`✅ Added specialization '${specName}' to user ${uuid}.`);
        await fetchUserSpecializations();
        setSelectedSpecialization("");
      } else {
        setMessage(`❌ ${result.error || "Failed to add specialization."}`);
      }
    } catch (error: any) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Remove specialization handler
  const handleRemoveSpecialization = async (specId: string) => {
    if (!uuid || !specId) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile/specializations/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uuid,
          specializationId: specId,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        const specName =
          userSpecializations.find((spec) => spec.id === specId)?.name || specId;
        setMessage(`✅ Removed specialization '${specName}' from user ${uuid}.`);
        await fetchUserSpecializations();
      } else {
        setMessage(`❌ ${result.error || "Failed to remove specialization."}`);
      }
    } catch (error: any) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter out already assigned specializations
  const filteredAvailableSpecializations = availableSpecializations.filter(
    (avail) => !userSpecializations.some((userSpec) => userSpec.id === avail.id)
  );

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white dark:bg-zinc-800 p-6 rounded shadow">
      <h2 className="text-xl font-bold mb-4 text-center">Manage User Specializations</h2>

      <Label htmlFor="user">Select User</Label>
      <select
        id="user"
        className="w-full mb-4 p-2 rounded border bg-white dark:bg-zinc-700 text-black dark:text-white"
        value={uuid}
        onChange={(e) => {
          const selectedUuid = e.target.value;
          
          // Reset states when no user is selected
          if (!selectedUuid) {
            setUuid("");
            setUserSpecializations([]);
            setAvailableSpecializations([]);
            setSelectedSpecialization("");
            return;
          }

          // Set the selected user ID
          setUuid(selectedUuid);
        }}
      >
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.display_name || user.email || user.id}
          </option>
        ))}
      </select>

      {uuid && (
        <>
          <div className="mb-4">
            <Label>Current Role</Label>
            <div className="p-2 bg-gray-100 dark:bg-zinc-700 rounded">
              {isRoleLoading ? 'Loading...' : role?.charAt(0).toUpperCase() + role?.slice(1)}
            </div>
            {roleError && (
              <p className="text-red-500 text-sm mt-1">{roleError}</p>
            )}
          </div>

          {/* Rest of the component remains the same */}
          <div className="mt-6">
            <Label className="block mb-2">Current Specializations</Label>
            <div className="border p-2 rounded min-h-12 mb-4 bg-gray-50 dark:bg-zinc-700">
              {userSpecializations.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center">No specializations assigned</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {userSpecializations.map((spec) => (
                    <div
                      key={spec.id}
                      className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded-full px-3 py-1 text-sm flex items-center"
                    >
                      {spec.name}
                      <button
                        onClick={() => handleRemoveSpecialization(spec.id)}
                        className="ml-2 text-red-500 hover:text-red-700 dark:text-red-300 dark:hover:text-red-100"
                        disabled={loading}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mb-4">
            <Label htmlFor="specialization" className="block mb-2">Add Specialization</Label>
            <div className="flex gap-2">
              <select
                id="specialization"
                className="flex-1 p-2 rounded border bg-white dark:bg-zinc-700 text-black dark:text-white"
                value={selectedSpecialization}
                onChange={(e) => setSelectedSpecialization(e.target.value)}
                disabled={filteredAvailableSpecializations.length === 0}
              >
                <option value="">Select a specialization</option>
                {filteredAvailableSpecializations.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name}
                  </option>
                ))}
              </select>
              <Button
                onClick={handleAddSpecialization}
                disabled={loading || !selectedSpecialization}
              >
                Add
              </Button>
            </div>
            {filteredAvailableSpecializations.length === 0 && (
              <p className="text-amber-600 dark:text-amber-400 text-sm mt-1">
                No available specializations for this role or all already assigned
              </p>
            )}
          </div>
        </>
      )}

      {message && (
        <div
          className={`mt-4 p-2 rounded text-sm ${
            message.startsWith("✅")
              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
              : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* Debug Information */}
      <div className="mt-4 text-xs text-gray-500">
        <details>
          <summary>Debug Info</summary>
          <pre>
            Role: {role} {'\n'}
            All Specializations: {JSON.stringify(allSpecializations, null, 2)} {'\n'}
            Available Specializations: {JSON.stringify(availableSpecializations, null, 2)} {'\n'}
            User Specializations: {JSON.stringify(userSpecializations, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}