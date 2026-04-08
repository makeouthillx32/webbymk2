// lib/exportUtils.ts - Simplified and focused export utilities

import { CMSBillingTemplate, BusinessCleaningRecord } from './CMSBillingTemplate';

// Re-export the interface for compatibility
export type { BusinessCleaningRecord } from './CMSBillingTemplate';

/**
 * Simplified export templates that delegate to the unified CMSBillingTemplate
 * This maintains compatibility with existing code while using the unified system
 */
export const exportTemplates = {
  billing: {
    /**
     * Generate Excel billing report using unified CMSBillingTemplate
     */
    excel: async (
      businesses: BusinessCleaningRecord[], 
      month: number, 
      year: number
    ): Promise<Blob> => {
      console.log("🎯 Using unified CMSBillingTemplate for Excel export...");
      
      try {
        const result = await CMSBillingTemplate.generateReport(
          businesses, 
          month, 
          year, 
          'excel'
        );
        
        if (result instanceof Blob) {
          return result;
        } else {
          throw new Error('Expected Blob from Excel generation');
        }
      } catch (error) {
        console.error('❌ Error in billing Excel export:', error);
        throw error;
      }
    },

    /**
     * Generate PDF billing report using unified CMSBillingTemplate
     */
    pdf: async (
      businesses: BusinessCleaningRecord[], 
      month: number, 
      year: number
    ): Promise<string> => {
      console.log("🎯 Using unified CMSBillingTemplate for PDF export...");
      
      try {
        const result = await CMSBillingTemplate.generateReport(
          businesses, 
          month, 
          year, 
          'pdf'
        );
        
        if (typeof result === 'string') {
          return result;
        } else {
          throw new Error('Expected HTML string from PDF generation');
        }
      } catch (error) {
        console.error('❌ Error in billing PDF export:', error);
        throw error;
      }
    }
  },

  // Placeholder for future export templates
  timesheet: {
    excel: async (data: any): Promise<Blob> => {
      throw new Error('Timesheet export not implemented yet');
    },
    pdf: async (data: any): Promise<string> => {
      throw new Error('Timesheet export not implemented yet');
    }
  },

  // Placeholder for schedule exports
  schedule: {
    excel: async (data: any): Promise<Blob> => {
      throw new Error('Schedule export not implemented yet');
    },
    pdf: async (data: any): Promise<string> => {
      throw new Error('Schedule export not implemented yet');
    }
  }
};

/**
 * Utility function to create a universal export template
 * This helps bridge the gap between the old exportUtils approach and UniversalExportButton
 */
export function createBillingExportTemplate(
  businesses: BusinessCleaningRecord[],
  month: number,
  year: number
) {
  return {
    id: 'cms-billing-export-utils',
    name: 'CMS Billing Report',
    data: { businesses, month, year },
    generator: async (data: any, format: 'excel' | 'pdf') => {
      const { businesses, month, year } = data;
      return await CMSBillingTemplate.generateReport(businesses, month, year, format);
    }
  };
}

/**
 * Helper function to get month name from month number
 */
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || 'Unknown';
}

/**
 * Helper function to format filename for exports
 */
export function formatExportFilename(
  prefix: string,
  month: number,
  year: number,
  suffix?: string
): string {
  const monthName = getMonthName(month);
  const timestamp = new Date().toISOString().split('T')[0];
  
  let filename = `${prefix}_${monthName}_${year}`;
  if (suffix) {
    filename += `_${suffix}`;
  }
  filename += `_${timestamp}`;
  
  return filename;
}