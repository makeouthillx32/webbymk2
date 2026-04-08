"use client";

import Link from "next/link";
import { DropdownMenuItem } from "./dropdown-menu";

interface SignInButtonProps {
  onClick?: () => void;
}

const SignInButton: React.FC<SignInButtonProps> = ({ onClick }) => (
  <DropdownMenuItem asChild>
    <Link
      href="/sign-in"
      onClick={onClick}
      className="w-full text-blue-600 dark:text-blue-400 font-semibold"
    >
      Sign in
    </Link>
  </DropdownMenuItem>
);

export default SignInButton;