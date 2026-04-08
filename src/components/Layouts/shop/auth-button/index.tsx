"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/app/provider";
import { AuthIcons } from "./icons";

interface AuthButtonProps {
  /** Optional callback for when the button is clicked (e.g., to close a mobile drawer) */
  onAction?: () => void;
  /** Whether to show text instead of the desktop icon pattern */
  isMobileVariant?: boolean;
}

export const AuthButton = ({ onAction, isMobileVariant = false }: AuthButtonProps) => {
  const { session } = useAuth();

  const handleAccountClick = () => {
    if (onAction) onAction();
    window.location.href = "/profile/me";
  };

  const handleSignInClick = () => {
    if (onAction) onAction();
  };

  if (!session) {
    return (
      <Link
        href="/sign-in"
        className="auth-button text-[var(--lt-fg)] hover:text-primary transition-colors focus:ring-primary"
        aria-label="Sign in"
        onClick={handleSignInClick}
      >
        {isMobileVariant ? (
          <span>Sign In</span>
        ) : (
          <>
            <span className="md:hidden">Sign In</span>
            <span className="hidden md:inline-flex items-center">
              <AuthIcons.User />
            </span>
          </>
        )}
      </Link>
    );
  }

  return (
    <button
      onClick={handleAccountClick}
      className="auth-button text-[var(--lt-fg)] hover:text-primary transition-colors focus:ring-primary"
      type="button"
      aria-label="Account"
    >
      {isMobileVariant ? (
        <span>Account</span>
      ) : (
        <>
          <span className="md:hidden">Account</span>
          <span className="hidden md:inline-flex items-center">
            <AuthIcons.User />
          </span>
        </>
      )}
    </button>
  );
};