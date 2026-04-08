'use client';

import React, { useState, useEffect } from 'react';

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  role_type: string;
}

interface EditRoleFormProps {
  role: Role | null;
  onSave: (role: Role) => void;
}

// Using chart colors from design system instead of hardcoded colors
const DEFAULT_COLORS = [
  'hsl(var(--chart-1))', // emerald equivalent
  'hsl(var(--chart-2))', // blue equivalent
  'hsl(var(--chart-3))', // violet equivalent
  'hsl(var(--chart-4))', // amber equivalent
  'hsl(var(--chart-5))', // red equivalent
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
];

const ROLE_TYPES = ['admin', 'jobcoach', 'client', 'user'];

export default function EditRoleForm({ role, onSave }: EditRoleFormProps) {
  // Initialize state with role data or default values
  const [formData, setFormData] = useState<Role>({
    id: role?.id || '',
    name: role?.name || '',
    description: role?.description || '',
    color: role?.color || DEFAULT_COLORS[0],
    role_type: role?.role_type || ROLE_TYPES[2], // default to 'client'
  });
  
  const [errors, setErrors] = useState({
    name: '',
    role_type: '',
  });
  
  const [selectedColor, setSelectedColor] = useState(formData.color);
  const [customColor, setCustomColor] = useState(
    DEFAULT_COLORS.includes(formData.color) ? '' : formData.color
  );

  // Update form when role prop changes
  useEffect(() => {
    if (role) {
      setFormData({
        id: role.id || '',
        name: role.name || '',
        description: role.description || '',
        color: role.color || DEFAULT_COLORS[0],
        role_type: role.role_type || ROLE_TYPES[2],
      });
      setSelectedColor(role.color || DEFAULT_COLORS[0]);
      setCustomColor(DEFAULT_COLORS.includes(role.color || '') ? '' : role.color || '');
    }
  }, [role]);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when field is edited
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Handle color selection
  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setFormData(prev => ({
      ...prev,
      color
    }));
    setCustomColor('');
  };

  // Handle custom color input
  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    if (isValidHexColor(color)) {
      setSelectedColor(color);
      setFormData(prev => ({
        ...prev,
        color
      }));
    }
  };

  // Validate hex color format
  const isValidHexColor = (color: string) => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    let isValid = true;
    const newErrors = { name: '', role_type: '' };
    
    if (!formData.name.trim()) {
      newErrors.name = 'Role name is required';
      isValid = false;
    }
    
    if (!formData.role_type) {
      newErrors.role_type = 'Role type is required';
      isValid = false;
    }
    
    setErrors(newErrors);
    
    if (isValid) {
      onSave(formData);
    }
  };

  return (
    <form id="role-form" onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-130px)]">
      {/* Role Name */}
      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
          Role Name*
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className={`w-full px-3 py-2 border rounded-[var(--radius)] shadow-[var(--shadow-xs)] 
            ${errors.name ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]'} 
            bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
            focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))]`}
          placeholder="Enter Role name"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-[hsl(var(--destructive))]">{errors.name}</p>
        )}
      </div>
      
      {/* Role Type */}
      <div className="mb-4">
        <label htmlFor="role_type" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
          Associated Role Type*
        </label>
        <select
          id="role_type"
          name="role_type"
          value={formData.role_type}
          onChange={handleChange}
          className={`w-full px-3 py-2 border rounded-[var(--radius)] shadow-[var(--shadow-xs)]
            ${errors.role_type ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--input))]'} 
            bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
            focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))]`}
        >
          <option value="">Select a role type</option>
          {ROLE_TYPES.map(type => (
            <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
          ))}
        </select>
        {errors.role_type && (
          <p className="mt-1 text-sm text-[hsl(var(--destructive))]">{errors.role_type}</p>
        )}
      </div>
      
      {/* Role Description */}
      <div className="mb-4">
        <label htmlFor="description" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 border border-[hsl(var(--input))] rounded-[var(--radius)] shadow-[var(--shadow-xs)] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))]"
          placeholder="Enter Role description (optional)"
        />
      </div>
      
      {/* Role Color */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
          Role Color
        </label>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {DEFAULT_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className={`w-full h-8 rounded-[var(--radius)] border-2 transition-all ${selectedColor === color ? 'border-[hsl(var(--sidebar-primary))]' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
              onClick={() => handleColorSelect(color)}
              aria-label={`Select color ${color}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customColor}
            onChange={handleCustomColorChange}
            placeholder="#HEX color"
            className="flex-1 px-3 py-2 border border-[hsl(var(--input))] rounded-[var(--radius)] shadow-[var(--shadow-xs)] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))]"
          />
          {customColor && (
            <div 
              className={`w-8 h-8 rounded-[var(--radius)] border ${isValidHexColor(customColor) ? 'border-transparent' : 'border-[hsl(var(--destructive))]'}`}
              style={{ backgroundColor: isValidHexColor(customColor) ? customColor : '#ffffff' }}
            />
          )}
        </div>
        {customColor && !isValidHexColor(customColor) && (
          <p className="mt-1 text-sm text-[hsl(var(--destructive))]">Please enter a valid hex color (e.g., #FF5500)</p>
        )}
      </div>
    </form>
  );
}