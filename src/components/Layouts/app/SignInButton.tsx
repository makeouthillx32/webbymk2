"use client";

import Link from "next/link";
import { DropdownMenuItem } from "./dropdown-menu";
import { useSignInHref } from "@/lib/useSignInHref";

interface SignInButtonProps {
  onClick?: () => void;
}

const SignInButton: React.FC<SignInButtonProps> = ({ onClick }) => {
  // /sign-in only lives on the core zone — a relative href 404s here since
  // this renders on app.unenter.live. Found via E2E checkout test, 2026-08-06.
  const signInHref = useSignInHref();
  return (
    <DropdownMenuItem asChild>
      <Link
        href={signInHref}
        onClick={onClick}
        className="w-full text-blue-600 dark:text-blue-400 font-semibold"
      >
        Sign in
      </Link>
    </DropdownMenuItem>
  );
};

export default SignInButton;