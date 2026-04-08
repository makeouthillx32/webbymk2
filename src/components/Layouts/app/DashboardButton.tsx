// components/ui/DashboardButton.tsx
"use client";

import Link from "next/link";
import { DropdownMenuItem } from "./dropdown-menu";

interface DashboardButtonProps {
  onClick?: () => void;
}

const DashboardButton: React.FC<DashboardButtonProps> = ({ onClick }) => (
  <DropdownMenuItem asChild>
    <Link href="/dashboard/me" onClick={onClick} className="w-full">
      Dashboard
    </Link>
  </DropdownMenuItem>
);

export default DashboardButton;
