"use client";

import Link from "next/link";
import { DropdownMenuItem } from "./dropdown-menu";

interface ScheduleButtonProps {
  onClick?: () => void;
}

const ScheduleButton: React.FC<ScheduleButtonProps> = ({ onClick }) => (
  <DropdownMenuItem asChild>
    <Link href="/CMS/schedule" onClick={onClick} className="w-full">
      Schedule
    </Link>
  </DropdownMenuItem>
);

export default ScheduleButton;
