"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export default function CMSSettings() {
  const supabase = createClient();
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBusinesses = async () => {
      const { data, error } = await supabase.from("Businesses").select("*");
      if (data) setBusinesses(data);
    };
    fetchBusinesses();
  }, [supabase]);

  const handleBusinessChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value);
    const { data, error } = await supabase
      .from("Schedule")
      .select("*")
      .eq("business_id", id)
      .single();
    if (data) setSelectedBusiness({ ...data, business_id: id });
  };

  const toggleDay = (day: string) => {
    if (!selectedBusiness) return;
    setSelectedBusiness((prev: any) => ({
      ...prev,
      [day]: !prev[day],
    }));
  };

  const saveChanges = async () => {
    if (!selectedBusiness) return;
    setLoading(true);
    const updatePayload: any = { business_id: selectedBusiness.business_id };
    weekdays.forEach((day) => {
      updatePayload[day] = selectedBusiness[day];
    });

    const { error } = await supabase
      .from("Schedule")
      .update(updatePayload)
      .eq("business_id", selectedBusiness.business_id);

    setLoading(false);
    if (!error) alert("Saved!");
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Manage CMS Schedule</h1>

      <select
        onChange={handleBusinessChange}
        className="w-full p-2 border border-gray-300 rounded-md"
        defaultValue=""
      >
        <option value="" disabled>
          Select a business
        </option>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.business_name}
          </option>
        ))}
      </select>

      {selectedBusiness && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {weekdays.map((day) => (
              <label key={day} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!selectedBusiness[day]}
                  onChange={() => toggleDay(day)}
                />
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </label>
            ))}
          </div>

          <button
            onClick={saveChanges}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
