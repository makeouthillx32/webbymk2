"use client";

import * as React from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface AccountSwitcherProps {
  isCollapsed: boolean;
  accounts: {
    label: string;
    email: string;
    icon: React.ReactNode;
  }[];
  selectedAccount?: string;
  onSelectAccount?: (email: string) => void;
}

export function AccountSwitcher({
  isCollapsed,
  accounts,
  selectedAccount: controlledAccount,
  onSelectAccount,
}: AccountSwitcherProps) {
  const [internalAccount, setInternalAccount] = React.useState(
    accounts[0]?.email || ""
  );

  const selectedAccount = controlledAccount || internalAccount;
  const current = accounts.find((acc) => acc.email === selectedAccount) || accounts[0];

  const handleSelect = (email: string) => {
    setInternalAccount(email);
    onSelectAccount?.(email);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={isCollapsed ? "icon" : "default"}
          className={cn(
            "w-full justify-between gap-2 px-2 hover:bg-accent",
            isCollapsed && "h-9 w-9 justify-center p-0"
          )}
          aria-label="Select account"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 text-primary">
              {current?.icon}
            </div>
            {!isCollapsed && (
              <span className="truncate text-sm font-medium">
                {current?.label}
              </span>
            )}
          </div>
          {!isCollapsed && (
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.email}
            onClick={() => handleSelect(account.email)}
            className="flex items-center gap-2 cursor-pointer py-2"
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5 text-primary">
              {account.icon}
            </div>
            <div className="flex flex-col truncate flex-1">
              <span className="text-xs font-semibold">{account.label}</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {account.email}
              </span>
            </div>
            {account.email === selectedAccount && (
              <Check className="ml-auto h-4 w-4 text-primary opacity-90" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
