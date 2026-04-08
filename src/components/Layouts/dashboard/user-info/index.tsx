"use client";

import { ChevronUpIcon } from "@/assets/icons";
import {
  Dropdown,
  DropdownContent,
  DropdownTrigger,
} from "@/components/Layouts/app/dropdown";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOutIcon, SettingsIcon, UserIcon } from "./icons";

export function UserInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const [USER, setUSER] = useState({
    name: "Loading...",
    email: "Loading...",
    img: "/images/user/user-03.png",
    id: "",
  });

  useEffect(() => {
    const getProfile = async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) return;

      const data = await res.json();

      setUSER({
        name: data.user_metadata.display_name,
        email: data.email,
        img: data.avatar_url,
        id: data.id,
      });
    };

    getProfile();
  }, []);

  return (
    <Dropdown isOpen={isOpen} setIsOpen={setIsOpen}>
      <DropdownTrigger className="rounded-[var(--radius)] align-middle outline-none ring-[hsl(var(--sidebar-ring))] ring-offset-2 focus-visible:ring-1 dark:ring-offset-[hsl(var(--card))]">
        <span className="sr-only">My Account</span>

        <figure className="flex items-center gap-3">
          <Image
            src={USER.img}
            className="size-12 rounded-full object-cover"
            alt={`Avatar of ${USER.name}`}
            role="presentation"
            width={200}
            height={200}
          />
          <figcaption className="flex items-center gap-1 font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--muted-foreground))] max-[1024px]:sr-only">
            <span>{USER.name}</span>
            <ChevronUpIcon
              aria-hidden
              className={cn(
                "rotate-180 transition-transform",
                isOpen && "rotate-0"
              )}
              strokeWidth={1.5}
            />
          </figcaption>
        </figure>
      </DropdownTrigger>

      <DropdownContent
        className="border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-[var(--shadow-md)] dark:border-[hsl(var(--sidebar-border))] dark:bg-[hsl(var(--card))] min-[230px]:min-w-[17.5rem]"
        align="end"
      >
        <h2 className="sr-only">User information</h2>

        <figure className="flex items-center gap-2.5 px-5 py-3.5">
          <Image
            src={USER.img}
            className="size-12 rounded-full object-cover"
            alt={`Avatar for ${USER.name}`}
            role="presentation"
            width={200}
            height={200}
          />
          <figcaption className="space-y-1 text-base font-medium">
            <div className="mb-2 leading-none text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
              {USER.name}
            </div>
            <div className="leading-none text-[hsl(var(--muted-foreground))]">{USER.email}</div>
          </figcaption>
        </figure>

        <hr className="border-[hsl(var(--border))] dark:border-[hsl(var(--sidebar-border))]" />

        <div className="p-2 text-base text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))] [&>*]:cursor-pointer">
          <Link
            href="/dashboard/me/profile"
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-[9px] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--secondary))] dark:hover:text-[hsl(var(--card-foreground))]"
          >
            <UserIcon />
            <span className="mr-auto text-base font-medium">View profile</span>
          </Link>

          <Link
            href={`/dashboard/${USER.id}/settings`}
            onClick={() => setIsOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-[9px] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--secondary))] dark:hover:text-[hsl(var(--card-foreground))]"
          >
            <SettingsIcon />
            <span className="mr-auto text-base font-medium">
              Account Settings
            </span>
          </Link>
        </div>

        <hr className="border-[hsl(var(--border))] dark:border-[hsl(var(--sidebar-border))]" />

        <div className="p-2 text-base text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]">
          <button
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-[9px] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--secondary))] dark:hover:text-[hsl(var(--card-foreground))]"
            onClick={() => setIsOpen(false)}
          >
            <LogOutIcon />
            <span className="text-base font-medium">Log out</span>
          </button>
        </div>
      </DropdownContent>
    </Dropdown>
  );
}