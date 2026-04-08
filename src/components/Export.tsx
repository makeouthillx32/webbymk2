// components/Export.tsx
import { useState } from "react";
import { useTheme } from "@/app/provider";
import { Download, FileSpreadsheet, FileText, ChevronDown, Calendar, Clock, DollarSign, Building2, FileBarChart, Printer } from "lucide-react";

// Universal Export Template Interface
export interface ExportTemplate {
  id: string;
  name: string;
  description?: string;
  data: any;
  generator: (data: any, format: 'excel' | 'pdf') => Promise<string | Blob | ArrayBuffer>;
  supportedFormats?: ('excel' | 'pdf')[];
  category?: 'billing' | 'timesheet' | 'calendar' | 'punchcard' | 'report' | 'other';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

// Template Registry - Central hub for all templates
export class TemplateRegistry {
  private static templates: Map<string, ExportTemplate> = new Map();

  // Register a template
  static register(template: ExportTemplate) {
    this.templates.set(template.id, template);
    console.log(`📝 Registered template: ${template.name} (${template.id})`);
  }

  // Get template by ID
  static get(id: string): ExportTemplate | undefined {
    return this.templates.get(id);
  }

  // Get all templates
  static getAll(): ExportTemplate[] {
    return Array.from(this.templates.values());
  }

  // Get templates by category
  static getByCategory(category: string): ExportTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }

  // Check if template exists
  static has(id: string): boolean {
    return this.templates.has(id);
  }

  // Remove a template
  static unregister(id: string): boolean {
    return this.templates.delete(id);
  }

  // Clear all templates
  static clear(): void {
    this.templates.clear();
  }

  // Get template count
  static count(): number {
    return this.templates.size;
  }
}

// Icon mapping for different categories
const CategoryIcons = {
  billing: Building2,
  timesheet: Clock,
  calendar: Calendar,
  punchcard: Printer,
  report: FileBarChart,
  other: FileBarChart
};

// Props interface
interface UniversalExportButtonProps {
  templateId: string;
  templateData?: any;
  filename?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'outline';
  onExportStart?: () => void;
  onExportComplete?: (success: boolean) => void;
  showTemplateInfo?: boolean;
}

// Main Export Component - NO DIRECT IMPORTS OF TEMPLATE FILES
export default function UniversalExportButton({
  templateId,
  templateData,
  filename,
  disabled = false,
  className = "",
  size = 'md',
  variant = 'primary',
  onExportStart,
  onExportComplete,
  showTemplateInfo = false
}: UniversalExportButtonProps) {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  const [isExporting, setIsExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get template from registry (populated by the consuming component)
  const template = TemplateRegistry.get(templateId);

  if (!template) {
    console.error(`❌ Template not found: ${templateId}`);
    console.log(`📋 Available templates: ${Array.from(TemplateRegistry.getAll().map(t => t.id)).join(', ')}`);
    return (
      <div className="text-red-500 text-sm p-2 border border-red-300 rounded">
        Template "{templateId}" not found. Please register it first.
      </div>
    );
  }

  // Size classes
  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  // Variant classes
  const getVariantClasses = () => {
    switch (variant) {
      case 'secondary':
        return "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80";
      case 'outline':
        return "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]";
      default:
        return "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] hover:bg-[hsl(var(--sidebar-primary))]/90";
    }
  };

  // Get supported formats for this template
  const supportedFormats = template.supportedFormats || ['excel', 'pdf'];

  // Handle export
  const handleExport = async (format: 'excel' | 'pdf') => {
    if (!supportedFormats.includes(format)) {
      setError(`${format.toUpperCase()} format not supported for this template`);
      return;
    }

    setIsExporting(true);
    setShowDropdown(false);
    setError(null);
    onExportStart?.();

    try {
      console.log(`🔄 Exporting ${template.name} as ${format.toUpperCase()}`);
      
      // Merge provided data with template data
      const exportData = { ...template.data, ...templateData };
      
      if (!exportData || Object.keys(exportData).length === 0) {
        throw new Error('No data provided for export');
      }

      // Call the generator function provided by the template
      const result = await template.generator(exportData, format);
      
      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const baseFilename = filename || `${template.name.replace(/\s+/g, '_')}_${timestamp}`;
      const extension = format === 'excel' ? 'xlsx' : 'pdf';
      const fullFilename = `${baseFilename}.${extension}`;

      // Handle download based on result type
      if (result instanceof Blob) {
        // Direct blob download (for Excel/PDF libraries)
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (result instanceof ArrayBuffer) {
        // ArrayBuffer (Excel workbooks)
        const blob = new Blob([result], { 
          type: format === 'excel' 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (typeof result === 'string') {
        // String content (HTML for PDF, CSV, etc.)
        const mimeType = format === 'excel' ? 'text/csv' : 'text/html';
        const blob = new Blob([result], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      console.log(`✅ ${template.name} exported successfully as ${format.toUpperCase()}`);
      onExportComplete?.(true);
      
    } catch (error) {
      console.error(`❌ Error exporting ${template.name}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      setError(errorMessage);
      onExportComplete?.(false);
    } finally {
      setIsExporting(false);
    }
  };

  // Get template icon (use provided icon or default to category icon)
  const TemplateIcon = template.icon || CategoryIcons[template.category || 'other'];

  return (
    <div className="relative inline-block">
      {/* Template Info (Optional) */}
      {showTemplateInfo && (
        <div className="mb-2 p-2 bg-[hsl(var(--muted))] rounded text-xs">
          <div className="flex items-center gap-1 font-medium">
            <TemplateIcon size={12} />
            {template.name}
          </div>
          {template.description && (
            <div className="text-[hsl(var(--muted-foreground))] mt-1">
              {template.description}
            </div>
          )}
        </div>
      )}

      {/* Main Export Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled || isExporting}
        className={`
          ${sizeClasses[size]}
          ${getVariantClasses()}
          rounded transition-colors font-medium flex items-center
          ${disabled || isExporting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${className}
        `}
        title={template.description}
      >
        <TemplateIcon size={16} className="mr-2" />
        {isExporting ? `Exporting...` : `Export ${template.name}`}
        <ChevronDown size={14} className="ml-2" />
      </button>

      {/* Error Display */}
      {error && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 z-50 max-w-xs">
          {error}
        </div>
      )}

      {/* Dropdown Menu */}
      {showDropdown && !disabled && !isExporting && (
        <div
          className={`absolute top-full left-0 mt-1 w-48 rounded-md shadow-lg z-50 ${
            isDark
              ? "bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              : "bg-white border border-[hsl(var(--border))]"
          }`}
        >
          <div className="py-1">
            {supportedFormats.includes('excel') && (
              <button
                onClick={() => handleExport('excel')}
                className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-[hsl(var(--accent))] transition-colors ${
                  isDark ? "text-[hsl(var(--foreground))]" : "text-gray-700"
                }`}
              >
                <FileSpreadsheet size={16} className="mr-2 text-green-600" />
                Export as Excel (.xlsx)
              </button>
            )}
            
            {supportedFormats.includes('pdf') && (
              <button
                onClick={() => handleExport('pdf')}
                className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-[hsl(var(--accent))] transition-colors ${
                  isDark ? "text-[hsl(var(--foreground))]" : "text-gray-700"
                }`}
              >
                <FileText size={16} className="mr-2 text-red-600" />
                Export as PDF (.pdf)
              </button>
            )}

            {/* Template Info in Dropdown */}
            {supportedFormats.length > 1 && (
              <div className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))]">
                Category: {template.category || 'Other'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}

// Utility function to create a template object
export const createExportTemplate = (config: {
  id: string;
  name: string;
  description?: string;
  category?: 'billing' | 'timesheet' | 'calendar' | 'punchcard' | 'report' | 'other';
  supportedFormats?: ('excel' | 'pdf')[];
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  generator: (data: any, format: 'excel' | 'pdf') => Promise<string | Blob | ArrayBuffer>;
}): ExportTemplate => ({
  data: {}, // Will be populated by the consumer
  ...config
});

// Hook to register and use templates
export const useExportTemplate = (template: ExportTemplate) => {
  // Register the template when hook is used
  TemplateRegistry.register(template);
  
  return {
    templateId: template.id,
    isRegistered: TemplateRegistry.has(template.id)
  };
};

// Export utilities for debugging and management
export const ExportUtils = {
  // Get all registered templates
  getRegisteredTemplates: () => TemplateRegistry.getAll(),
  
  // Get template by ID
  getTemplate: (id: string) => TemplateRegistry.get(id),
  
  // Check if template exists
  hasTemplate: (id: string) => TemplateRegistry.has(id),
  
  // Get templates by category
  getTemplatesByCategory: (category: string) => TemplateRegistry.getByCategory(category),
  
  // Clear all templates (useful for testing)
  clearAllTemplates: () => TemplateRegistry.clear(),
  
  // Get registry stats
  getStats: () => ({
    totalTemplates: TemplateRegistry.count(),
    categories: [...new Set(TemplateRegistry.getAll().map(t => t.category))],
    templateIds: TemplateRegistry.getAll().map(t => t.id)
  })
};