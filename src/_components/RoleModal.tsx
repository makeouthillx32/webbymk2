'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import EditRoleForm, { Role } from './EditRoleForm';
import ManageMembersTab from './ManageMembersTab';

interface RoleModalProps {
  title: string;
  role: Role | null;
  onClose: () => void;
  onSave: (role: Role) => void;
}

type TabType = 'edit' | 'members';

export default function RoleModal({ title, role, onClose, onSave }: RoleModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('edit');

  const handleSubmit = (formData: Role) => {
    onSave(formData);
  };

  // Handler for removing a member from the role
  const handleRemoveMember = async (userId: string) => {
    if (!role?.id) return;
    
    try {
      const response = await fetch('/api/profile/specializations/remove-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: role.id, userId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove member');
      }
      
      // The ManageMembersTab component will refresh its own data
    } catch (error) {
      console.error('Error removing member:', error);
      // You might want to add error handling UI here
    }
  };

  // Handler for the "Add Members" button click
  const handleAddMembersClick = () => {
    // This could open another modal or expand a section
    // For now, we'll just log this action
    console.log('Add members clicked for role:', role?.id);
    // You could implement this functionality later
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--foreground))/0.3]">
      <div className="bg-[hsl(var(--background))] rounded-[var(--radius)] shadow-[var(--shadow-lg)] max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h2>
          <button 
            onClick={onClose}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-[hsl(var(--border))]">
          <button
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'edit'
                ? 'text-[hsl(var(--sidebar-primary))] border-b-2 border-[hsl(var(--sidebar-primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors'
            }`}
            onClick={() => setActiveTab('edit')}
          >
            Details
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'members'
                ? 'text-[hsl(var(--sidebar-primary))] border-b-2 border-[hsl(var(--sidebar-primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors'
            }`}
            onClick={() => setActiveTab('members')}
            disabled={!role?.id}
          >
            Manage Members
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'edit' ? (
            <EditRoleForm role={role} onSave={handleSubmit} />
          ) : (
            role && <ManageMembersTab 
              roleId={role.id || ''} 
              roleName={role.name || ''} 
              onRemoveMember={handleRemoveMember}
              onAddClick={handleAddMembersClick}
            />
          )}
        </div>
        
        {/* Footer */}
        {activeTab === 'edit' && (
          <div className="flex justify-end p-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 mr-2 border border-[hsl(var(--border))] rounded-[var(--radius)] shadow-[var(--shadow-sm)] text-sm font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="role-form"
              className="px-4 py-2 border border-transparent rounded-[var(--radius)] shadow-[var(--shadow-sm)] text-sm font-medium text-[hsl(var(--sidebar-primary-foreground))] bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))/0.9] transition-colors"
            >
              {role ? 'Update Specialization' : 'Create Specialization'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}