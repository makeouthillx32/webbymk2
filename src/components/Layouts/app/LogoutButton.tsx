// components/Layouts/appheader/LogoutButton.tsx
"use client";

import React from "react";
import { DropdownMenuItem } from "./dropdown-menu";
import { signOutAction } from "@/actions/auth";

const LogoutButton: React.FC = () => {
  const handleLogout = async () => {
    try {
      console.log("🚪 [LOGOUT] Starting logout process...");
      
      // Use the server action which properly clears cookies and session
      await signOutAction();
      
      console.log("🚪 [LOGOUT] Logout completed");
      
    } catch (error) {
      console.error("🚪 [LOGOUT] Error during logout:", error);
      
      // Fallback: Force redirect to sign-in if there's an error
      window.location.href = "/sign-in";
    }
  };

  return (
    <DropdownMenuItem variant="danger" onSelect={handleLogout}>
      Log out
    </DropdownMenuItem>
  );
};

export default LogoutButton;