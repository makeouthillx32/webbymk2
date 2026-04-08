"use client";

import Link from "next/link";
import { DropdownMenuItem } from "./dropdown-menu";

interface HomeButtonProps {
  onClick?: () => void;
}

const HomeButton: React.FC<HomeButtonProps> = ({ onClick }) => (
  <DropdownMenuItem asChild>
    <Link href="/" onClick={onClick} className="w-full">
      Home
    </Link>
  </DropdownMenuItem>
);

export default HomeButton;