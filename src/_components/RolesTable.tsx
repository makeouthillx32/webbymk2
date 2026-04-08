// app/dashboard/[id]/settings/roles/_components/RolesTable.tsx

'use client';

import React from 'react';
import { Edit2, Trash2, Loader2 } from 'lucide-react';

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  role_type: string;
  member_count: number;
}

interface RolesTableProps {
  roles: Role[];
  allRolesCount: number;
  loadingMemberCounts: boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

const getRoleTypeBadgeClass = (roleType: string): string => {
  switch (roleType.toLowerCase()) {
    case 'admin':
      return 'bg-[hsl(var(--destructive))/0.1] text-[hsl(var(--destructive))]';
    case 'coach':
    case 'jobcoach':
      return 'bg-[hsl(var(--sidebar-primary))/0.1] text-[hsl(var(--sidebar-primary))]';
    case 'client':
      return 'bg-[hsl(var(--chart-2))/0.1] text-[hsl(var(--chart-2))]';
    default:
      return 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  }
};

export default function RolesTable({
  roles,
  allRolesCount,
  loadingMemberCounts,
  onEdit,
  onDelete,
}: RolesTableProps) {
  if (roles.length === 0) {
    return (
      <p className="py-8 text-center text-[hsl(var(--muted-foreground))]">
        No roles found.
      </p>
    );
  }

  return (
    <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)]">
      {/* Column headers */}
      <div className="grid grid-cols-12 p-4 bg-[hsl(var(--muted))] font-medium text-[hsl(var(--muted-foreground))] text-xs uppercase tracking-wider">
        <div className="col-span-3 md:col-span-2">Color</div>
        <div className="col-span-5 md:col-span-3">Name</div>
        <div className="hidden md:block md:col-span-2">Type</div>
        <div className="hidden md:block md:col-span-3">Description</div>
        <div className="col-span-2 md:col-span-1 text-center">Members</div>
        <div className="col-span-2 md:col-span-1 text-center">Actions</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[hsl(var(--border))]">
        {roles.map((role) => {
          const badgeClass = getRoleTypeBadgeClass(role.role_type);
          return (
            <div
              key={role.id}
              className="role-item grid grid-cols-12 p-4 border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--accent))] transition-colors"
            >
              {/* Color + hex */}
              <div className="col-span-3 md:col-span-2 flex items-center">
                <div
                  className="role-color w-6 h-6 rounded-full flex-shrink-0 shadow-[var(--shadow-xs)]"
                  style={{ backgroundColor: role.color }}
                />
                <span className="ml-2 font-medium text-xs text-[hsl(var(--muted-foreground))] hidden md:block">
                  {role.color}
                </span>
              </div>

              {/* Name */}
              <div className="col-span-5 md:col-span-3 flex items-center">
                <span className="font-medium text-[hsl(var(--foreground))] truncate">
                  {role.name}
                </span>
              </div>

              {/* Type badge */}
              <div className="hidden md:flex md:col-span-2 items-center">
                <span className={`px-2 py-1 text-xs rounded-full ${badgeClass}`}>
                  {role.role_type}
                </span>
              </div>

              {/* Description */}
              <div className="hidden md:block md:col-span-3 text-[hsl(var(--muted-foreground))] truncate">
                {role.description || 'No description available'}
              </div>

              {/* Member count or spinner */}
              <div className="col-span-2 md:col-span-1 flex items-center justify-center">
                {loadingMemberCounts ? (
                  <Loader2
                    size={16}
                    className="animate-spin text-[hsl(var(--muted-foreground))]"
                  />
                ) : (
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {role.member_count}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="col-span-2 md:col-span-1 flex items-center justify-center space-x-2">
                <button
                  onClick={() => onEdit(role)}
                  className="p-1 text-[hsl(var(--sidebar-primary))] hover:text-[hsl(var(--sidebar-primary))/0.8] transition-colors"
                  title="Edit role"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => onDelete(role)}
                  className="p-1 text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))/0.8] transition-colors"
                  title="Delete role"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="p-4 text-sm text-[hsl(var(--muted-foreground))]">
        Showing {roles.length} of {allRolesCount} roles
      </div>
    </div>
  );
}