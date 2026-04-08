import { useState } from "react";
import { useTheme } from "@/app/provider";
import { Download, FileSpreadsheet, FileText, ChevronDown, Calendar } from "lucide-react";

export interface ExportTemplate {
  id: string;
  name: string;
  data: any;
  generator: (data: any, format: 'excel' | 'pdf') => Promise<string | Blob>;
}

interface UniversalExportButtonProps {
  template: ExportTemplate;
  filename?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'outline';
}

function getPacificTimeDate(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
}

export default function UniversalExportButton({
  template,
  filename,
  disabled = false,
  className = "",
  size = 'md',
  variant = 'primary'
}: UniversalExportButtonProps) {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  const [isExporting, setIsExporting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

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

  const getMonthName = (month: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || '';
  };

  const handleExport = async (monthType: 'current' | 'last') => {
    setIsExporting(true);
    setShowDropdown(false);

    try {
      const pacificTime = getPacificTimeDate();
      let exportMonth, exportYear;

      if (monthType === 'current') {
        exportMonth = pacificTime.getMonth() + 1;
        exportYear = pacificTime.getFullYear();
      } else {
        pacificTime.setMonth(pacificTime.getMonth() - 1);
        exportMonth = pacificTime.getMonth() + 1;
        exportYear = pacificTime.getFullYear();
      }

      const exportData = {
        ...template.data,
        month: exportMonth,
        year: exportYear
      };

      console.log(`🔄 Exporting ${template.name} for ${getMonthName(exportMonth)} ${exportYear}`);
      
      const result = await template.generator(exportData, 'excel');
      
      const timestamp = new Date().toISOString().split('T')[0];
      const monthName = getMonthName(exportMonth);
      const baseFilename = filename || `${template.name}_${monthName}_${exportYear}_${timestamp}`;
      const fullFilename = `${baseFilename}.xlsx`;

      if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      console.log(`✅ ${template.name} exported successfully`);
      
    } catch (error) {
      console.error(`❌ Error exporting ${template.name}:`, error);
      alert(`Failed to export ${template.name}. Please try again.`);
    } finally {
      setIsExporting(false);
    }
  };

  const pacificTime = getPacificTimeDate();
  const currentMonth = getMonthName(pacificTime.getMonth() + 1);
  const lastMonthDate = new Date(pacificTime);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = getMonthName(lastMonthDate.getMonth() + 1);

  return (
    <div className="relative inline-block">
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
      >
        <Download size={16} className="mr-2" />
        {isExporting ? `Exporting...` : `Export`}
        <ChevronDown size={14} className="ml-2" />
      </button>

      {showDropdown && !disabled && !isExporting && (
        <div
          className={`absolute top-full right-0 mt-1 w-48 rounded-md shadow-lg z-50 ${
            isDark
              ? "bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
              : "bg-white border border-[hsl(var(--border))]"
          }`}
        >
          <div className="py-1">
            <button
              onClick={() => handleExport('current')}
              className={`w-full px-4 py-3 text-left text-sm flex items-center hover:bg-[hsl(var(--accent))] transition-colors ${
                isDark ? "text-[hsl(var(--foreground))]" : "text-gray-700"
              }`}
            >
              <FileSpreadsheet size={16} className="mr-3 text-green-600" />
              <div>
                <div className="font-medium">{currentMonth} {pacificTime.getFullYear()}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Current Month</div>
              </div>
            </button>
            
            <button
              onClick={() => handleExport('last')}
              className={`w-full px-4 py-3 text-left text-sm flex items-center hover:bg-[hsl(var(--accent))] transition-colors ${
                isDark ? "text-[hsl(var(--foreground))]" : "text-gray-700"
              }`}
            >
              <FileSpreadsheet size={16} className="mr-3 text-green-600" />
              <div>
                <div className="font-medium">{lastMonth} {lastMonthDate.getFullYear()}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Last Month</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}