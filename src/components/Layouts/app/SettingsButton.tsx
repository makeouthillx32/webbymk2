"use client";

import Link from "next/link";
import { DropdownMenuItem } from "./dropdown-menu";

interface SettingsButtonProps {
  activePage: string;
  onClick?: () => void;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({ activePage, onClick }) => {
  const settingsLink = `/settings/${activePage}`;

  return (
    <DropdownMenuItem asChild>
      <Link href={settingsLink} onClick={onClick} className="w-full">
        Settings
      </Link>
    </DropdownMenuItem>
  );
};

export default SettingsButton;