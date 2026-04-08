"use client";

import { useEffect, useState } from "react";
import {
  CallIcon,
  EmailIcon,
  UserIcon,
} from "@/assets/icons";
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";

export function PersonalInfoForm() {
  const [profile, setProfile] = useState({
    display_name: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const user = await res.json();

      setProfile({
        display_name: user.user_metadata?.display_name || "",
        phone: user.phone || "",
        email: user.email || "",
      });
    };

    fetchProfile();
  }, []);

  return (
    <ShowcaseSection title="Personal Information" className="!p-7">
      <form>
        <div className="mb-5.5 flex flex-col gap-5.5 sm:flex-row">
          <InputGroup
            className="w-full sm:w-1/2"
            type="text"
            name="displayName"
            label="Display Name"
            placeholder="Username"
            defaultValue={profile.display_name}
            icon={<UserIcon />}
            iconPosition="left"
            height="sm"
          />

          <InputGroup
            className="w-full sm:w-1/2"
            type="text"
            name="phoneNumber"
            label="Phone Number"
            placeholder="+990 3343 7865"
            defaultValue={profile.phone}
            icon={<CallIcon />}
            iconPosition="left"
            height="sm"
          />
        </div>

        <InputGroup
          className="mb-5.5"
          type="email"
          name="email"
          label="Email Address"
          placeholder="example@email.com"
          defaultValue={profile.email}
          icon={<EmailIcon />}
          iconPosition="left"
          height="sm"
        />

        <div className="flex justify-end gap-3">
          <button
            className="rounded-lg border border-stroke px-6 py-[7px] font-medium text-dark hover:shadow-1 dark:border-dark-3 dark:text-white"
            type="button"
          >
            Cancel
          </button>

          <button
            className="rounded-lg bg-primary px-6 py-[7px] font-medium text-gray-2 hover:bg-opacity-90"
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </ShowcaseSection>
  );
}