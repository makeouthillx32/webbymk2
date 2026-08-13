// lib/templates/registerDesertTimesheet.ts - Register with your TemplateRegistry
import { TemplateRegistry, TemplateIcons } from '../../components/Export';
import { DesertTimesheetTemplate } from '../DesertTimesheetTemplate';

// Register the Desert Area Timesheet template with your system
TemplateRegistry.register({
  id: 'desert-area-timesheet',
  name: 'Desert Area Timesheet', 
  description: 'Official Desert Area Resources & Training timesheet form matching physical layout',
  category: 'timesheet',
  icon: TemplateIcons.timesheet,
  supportedFormats: ['excel', 'pdf'],
  data: {}, // Will be populated when used
  generator: async (data: any, format: 'excel' | 'pdf') => {
    console.log(`🏜️ Desert Timesheet: Generating ${format} export`);
    console.log('📋 Data received:', data);
    
    const { employeeName, payrollPeriod, weeks } = data;
    
    // Validate required data
    if (!employeeName) {
      throw new Error('Employee name is required');
    }
    if (!payrollPeriod || (payrollPeriod !== 1 && payrollPeriod !== 2)) {
      throw new Error('Valid payroll period (1 or 2) is required');
    }
    if (!weeks || !Array.isArray(weeks)) {
      throw new Error('Weeks data is required');
    }

    console.log(`✅ Creating ${format.toUpperCase()} document for ${employeeName}, Period ${payrollPeriod}`);

    // Use your class-based template system  
    const result = await DesertTimesheetTemplate.generateReport(
      employeeName,
      payrollPeriod,
      weeks,
      format
    );

    console.log(`🎯 ${format.toUpperCase()} document generated successfully`);
    return result;
  }
});

console.log('✅ Desert Area Timesheet template registered successfully');