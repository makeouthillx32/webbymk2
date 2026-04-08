// lib/DesertTimesheetTemplate.ts - Following your CMSBillingTemplate pattern
import * as XLSX from 'sheetjs-style';

export interface TimesheetRowData {
  day: string;
  starthour: number;
  startminute: number;
  startampm: string;
  endhour: number;
  endminute: number;
  endampm: string;
  breaktime: number;
}

export interface TimesheetWeekData {
  id: number;
  name: string;
  rows: TimesheetRowData[];
}

export interface DesertTimesheetData {
  employeeName: string;
  payrollPeriod: 1 | 2;
  weeks: TimesheetWeekData[];
  generated_at: string;
  generated_by?: string;
}

export class DesertTimesheetTemplate {
  private data: DesertTimesheetData;

  constructor(employeeName: string, payrollPeriod: 1 | 2, weeks: TimesheetWeekData[]) {
    this.data = {
      employeeName,
      payrollPeriod,
      weeks,
      generated_at: new Date().toISOString()
    };
  }

  static async generateReport(
    employeeName: string,
    payrollPeriod: 1 | 2,
    weeks: TimesheetWeekData[],
    format: 'excel' | 'pdf'
  ): Promise<Blob | string> {
    console.log(`🔧 Generating Desert Timesheet ${format} for ${employeeName} - Period ${payrollPeriod}`);
    const template = new DesertTimesheetTemplate(employeeName, payrollPeriod, weeks);
    
    if (format === 'excel') {
      const arrayBuffer = template.generateExcel();
      return new Blob([arrayBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
    } else {
      return template.generateHTML();
    }
  }

  private convertTimeToString(hour: number, minute: number, ampm: string): string {
    return `${hour}:${minute.toString().padStart(2, '0')} ${ampm}`;
  }

  private calculateHours(row: TimesheetRowData): number {
    const convertTo24Hour = (hour: number, ampm: string): number => {
      if (ampm === "PM" && hour !== 12) return hour + 12;
      if (ampm === "AM" && hour === 12) return 0;
      return hour;
    };

    const startHour = convertTo24Hour(row.starthour, row.startampm);
    const endHour = convertTo24Hour(row.endhour, row.endampm);
    const totalMinutes = endHour * 60 + row.endminute - (startHour * 60 + row.startminute) - row.breaktime;
    return totalMinutes > 0 ? totalMinutes / 60 : 0;
  }

  generateExcel(): ArrayBuffer {
    console.log('📊 Generating Desert Timesheet Excel with exact form layout');
    
    // Prepare timesheet rows data
    const timesheetRows: Array<{
      date: string;
      timeIn: string;
      timeOut: string;
      totalHours: number;
    }> = [];

    this.data.weeks.forEach(week => {
      week.rows.forEach(row => {
        timesheetRows.push({
          date: row.day,
          timeIn: this.convertTimeToString(row.starthour, row.startminute, row.startampm),
          timeOut: this.convertTimeToString(row.endhour, row.endminute, row.endampm),
          totalHours: this.calculateHours(row)
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    // Build the exact form layout
    wsData.push(['DESERT AREA RESOURCES & TRAINING', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    wsData.push(['TIME SHEET', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']); // Empty row
    
    // Employee info row
    wsData.push([
      `Employee's Name: ${this.data.employeeName}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 
      `Type/Burns: `
    ]);
    wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']); // Empty row

    // Column headers matching the physical form exactly
    wsData.push([
      'DATE',
      "Employee's Signature & date",
      'Base Hours', 
      'late scheduled in Tool Hr (Hours)',
      'OVERTIME HOURS',
      'TOTAL BENEFIT HOURS', 
      'Vacation Leave',
      'Sick Leave',
      'Holiday',
      'Other',
      'Job Coach JAY Team',
      'Thru Social Policy',
      'Time Out',
      'Time In', 
      'Time Out',
      'Time In',
      'DATE'
    ]);

    // Create 15 data rows for dates 16-31 (matching the physical form)
    for (let i = 0; i < 15; i++) {
      const date = i + 16;
      const rowData = timesheetRows[i] || {};
      
      wsData.push([
        date.toString(),                    // DATE
        '',                                 // Employee Signature & Date  
        '',                                 // Base Hours
        '',                                 // late scheduled in Tool Hr
        '',                                 // OVERTIME HOURS
        '',                                 // TOTAL BENEFIT HOURS
        '',                                 // Vacation Leave
        '',                                 // Sick Leave  
        '',                                 // Holiday
        '',                                 // Other
        '',                                 // Job Coach JAY Team
        '',                                 // Thru Social Policy
        rowData.timeOut || '',              // Time Out
        rowData.timeIn || '',               // Time In
        '',                                 // Time Out (second)
        '',                                 // Time In (second) 
        date.toString()                     // DATE (repeat)
      ]);
    }

    // Total row
    wsData.push([
      'TOTAL HRS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '31'
    ]);

    // Notes section at bottom
    wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    wsData.push(['Supervisor\'s Signature & date:', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `Payroll Period: ${this.data.payrollPeriod === 1 ? '☑' : '☐'} 1st  ${this.data.payrollPeriod === 2 ? '☑' : '☐'} 2nd`]);
    wsData.push(['I certify that the above information is true and correct to the best of my knowledge', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths to match the form layout
    ws['!cols'] = [
      { wch: 8 },   // DATE
      { wch: 15 },  // Employee Signature  
      { wch: 10 },  // Base Hours
      { wch: 12 },  // Tool Hr
      { wch: 12 },  // Overtime
      { wch: 15 },  // Benefits
      { wch: 12 },  // Vacation
      { wch: 10 },  // Sick
      { wch: 10 },  // Holiday
      { wch: 8 },   // Other
      { wch: 12 },  // Job Coach
      { wch: 12 },  // Social Policy
      { wch: 10 },  // Time Out
      { wch: 10 },  // Time In
      { wch: 10 },  // Time Out 2
      { wch: 10 },  // Time In 2
      { wch: 8 }    // DATE
    ];

    // Apply comprehensive styling to match the form
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { v: '', t: 's' };
        }

        // Default cell styling with borders
        ws[cellAddress].s = {
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          },
          alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
        };

        // Header styling
        if (R === 0) { // Main title
          ws[cellAddress].s.font = { bold: true, size: 16 };
          ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (R === 1) { // Subtitle  
          ws[cellAddress].s.font = { bold: true, size: 14 };
          ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (R === 3) { // Employee info row
          ws[cellAddress].s.font = { bold: true, size: 11 };
          ws[cellAddress].s.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if (R === 5) { // Column headers
          ws[cellAddress].s.font = { bold: true, size: 8 };
          ws[cellAddress].s.fill = { fgColor: { rgb: 'F0F0F0' } };
          ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          ws[cellAddress].s.border = {
            top: { style: 'medium', color: { rgb: '000000' } },
            bottom: { style: 'medium', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          };
        } else if (R === wsData.length - 4) { // Total row
          ws[cellAddress].s.font = { bold: true, size: 10 };
          ws[cellAddress].s.fill = { fgColor: { rgb: 'E0E0E0' } };
        } else if (R >= wsData.length - 3) { // Signature section
          ws[cellAddress].s.font = { size: 9 };
          ws[cellAddress].s.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Special styling for date columns
        if ((C === 0 || C === 16) && R > 5 && R < wsData.length - 4) {
          ws[cellAddress].s.font = { bold: true, size: 10 };
          ws[cellAddress].s.fill = { fgColor: { rgb: 'F8F8F8' } };
        }

        // Time columns styling
        if ((C === 12 || C === 13) && R > 5 && R < wsData.length - 4) {
          ws[cellAddress].s.fill = { fgColor: { rgb: 'FFF8DC' } };
        }
      }
    }

    // Merge cells for headers and signatures
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } }, // Main title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } }, // Subtitle
      { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } }, // Employee name
      { s: { r: 3, c: 11 }, e: { r: 3, c: 16 } }, // Type/Burns
      { s: { r: wsData.length - 2, c: 0 }, e: { r: wsData.length - 2, c: 10 } }, // Signature line
      { s: { r: wsData.length - 2, c: 11 }, e: { r: wsData.length - 2, c: 16 } }, // Payroll period
      { s: { r: wsData.length - 1, c: 0 }, e: { r: wsData.length - 1, c: 16 } }  // Certification text
    ];

    // Set specific row heights
    const rowHeights: any[] = [];
    for (let i = 0; i < wsData.length; i++) {
      if (i === 0 || i === 1) {
        rowHeights.push({ hpt: 24 }); // Header rows
      } else if (i === 2 || i === 4) {
        rowHeights.push({ hpt: 8 });  // Empty spacing rows
      } else if (i === 3) {
        rowHeights.push({ hpt: 20 }); // Employee info
      } else if (i === 5) {
        rowHeights.push({ hpt: 60 }); // Column headers (tall for wrapped text)
      } else if (i >= 6 && i < wsData.length - 4) {
        rowHeights.push({ hpt: 20 }); // Data rows
      } else {
        rowHeights.push({ hpt: 18 }); // Signature/notes section
      }
    }
    ws['!rows'] = rowHeights;

    // Page setup for proper printing
    ws['!margins'] = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
    ws['!pageSetup'] = { 
      paperSize: 1,        // Letter size
      orientation: 'landscape', 
      fitToWidth: 1, 
      fitToHeight: 0,
      horizontalDpi: 300,
      verticalDpi: 300
    };

    XLSX.utils.book_append_sheet(wb, ws, 'Desert Timesheet');
    console.log('✅ Desert Timesheet Excel generation complete with exact form layout');
    
    return XLSX.write(wb, { 
      bookType: 'xlsx', 
      type: 'array', 
      cellStyles: true, 
      cellNF: false, 
      sheetStubs: false 
    });
  }

  generateHTML(): string {
    console.log('🌐 Generating Desert Timesheet HTML');
    
    // Prepare timesheet rows
    const timesheetRows: Array<{
      date: string;
      timeIn: string;
      timeOut: string;
      totalHours: number;
    }> = [];

    this.data.weeks.forEach(week => {
      week.rows.forEach(row => {
        timesheetRows.push({
          date: row.day,
          timeIn: this.convertTimeToString(row.starthour, row.startminute, row.startampm),
          timeOut: this.convertTimeToString(row.endhour, row.endminute, row.endampm),
          totalHours: this.calculateHours(row)
        });
      });
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Desert Area Resources & Training - Time Sheet</title>
    <style>
        @page { size: 8.5in 11in; margin: 0.5in; }
        body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 0; }
        .container { width: 100%; border: 2px solid black; padding: 10px; }
        .header { text-align: center; margin-bottom: 15px; }
        .header h1 { font-size: 16px; font-weight: bold; margin: 0; text-transform: uppercase; }
        .header h2 { font-size: 14px; font-weight: bold; margin: 5px 0 0 0; text-transform: uppercase; }
        .form-row { display: flex; margin-bottom: 8px; }
        .form-field { margin-right: 20px; display: flex; align-items: center; }
        .form-field label { font-weight: bold; margin-right: 5px; text-transform: uppercase; font-size: 9px; }
        .form-field input { border: none; border-bottom: 1px solid black; background: transparent; padding: 2px; min-width: 120px; font-size: 10px; }
        .time-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .time-table th, .time-table td { border: 1px solid black; padding: 4px; text-align: center; font-size: 9px; }
        .time-table th { background-color: #f0f0f0; font-weight: bold; text-transform: uppercase; }
        .rotated-header { writing-mode: vertical-rl; text-orientation: mixed; white-space: nowrap; min-width: 25px; height: 120px; }
        .date-column { width: 30px; }
        .signature-section { display: flex; justify-content: space-between; margin-top: 20px; align-items: flex-end; }
        .signature-field { flex: 1; margin: 0 20px; }
        .signature-field label { display: block; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; font-size: 9px; }
        .signature-line { border-bottom: 1px solid black; height: 20px; width: 100%; }
        .total-row { background-color: #f5f5f5; font-weight: bold; }
        .checkbox { width: 12px; height: 12px; border: 1px solid black; display: inline-block; margin-right: 5px; ${this.data.payrollPeriod === 1 ? 'background: black;' : ''} }
        .checkbox2 { width: 12px; height: 12px; border: 1px solid black; display: inline-block; margin-right: 5px; ${this.data.payrollPeriod === 2 ? 'background: black;' : ''} }
        .notes { margin-top: 15px; font-size: 8px; line-height: 1.3; }
        @media print { body { print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Desert Area Resources & Training</h1>
            <h2>Time Sheet</h2>
        </div>
        
        <div class="form-row">
            <div class="form-field">
                <label>Employee's Name:</label>
                <input type="text" value="${this.data.employeeName}" readonly>
            </div>
            <div class="form-field">
                <label>Type/Erns:</label>
                <input type="text" value="" readonly>
            </div>
        </div>
        
        <table class="time-table">
            <thead>
                <tr>
                    <th class="date-column">DATE</th>
                    <th class="rotated-header">Employee's Signature & date</th>
                    <th class="rotated-header">Base Hours</th>
                    <th class="rotated-header">late scheduled in Tool Hr (Hours)</th>
                    <th class="rotated-header">OVERTIME HOURS</th>
                    <th class="rotated-header">TOTAL BENEFIT HOURS</th>
                    <th class="rotated-header">Vacation Leave</th>
                    <th class="rotated-header">Sick Leave</th>
                    <th class="rotated-header">Holiday</th>
                    <th class="rotated-header">Other</th>
                    <th class="rotated-header">Job Coach JAY Team</th>
                    <th class="rotated-header">Thru Social Policy</th>
                    <th class="rotated-header">Time Out</th>
                    <th class="rotated-header">Time In</th>
                    <th class="rotated-header">Time Out</th>
                    <th class="rotated-header">Time In</th>
                    <th class="date-column">DATE</th>
                </tr>
            </thead>
            <tbody>
                ${Array.from({ length: 15 }, (_, i) => {
                  const date = i + 16;
                  const rowData = timesheetRows.find(r => r.date.toLowerCase().includes(date.toString())) || 
                                 timesheetRows[i] || {};
                  return `
                    <tr>
                        <td>${date}</td>
                        <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                        <td>${rowData.timeOut || ''}</td>
                        <td>${rowData.timeIn || ''}</td>
                        <td></td><td></td>
                        <td>${date}</td>
                    </tr>`;
                }).join('')}
                <tr class="total-row">
                    <td><strong>TOTAL<br>HRS</strong></td>
                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                    <td><strong>31</strong></td>
                </tr>
            </tbody>
        </table>
        
        <div class="signature-section">
            <div class="signature-field">
                <label>Supervisor's Signature & date</label>
                <div class="signature-line"></div>
                <small>I certify that the above information is true and correct to the best of my knowledge.</small>
            </div>
            <div class="signature-field">
                <label>Payroll Period:</label>
                <div style="margin-top: 10px;">
                    <span class="checkbox"></span>
                    <span style="margin-right: 15px;">1st</span>
                    <span class="checkbox2"></span>
                    <span>2nd</span>
                </div>
            </div>
        </div>
        
        <div class="notes">
            <p><strong>* Circle the above information on first and received as any break except.</strong></p>
            <p><strong>4) Over 0.5 hr per day break must be deducted if employees scheduled.</strong></p>
            <p><strong>5) Work hours that are:</strong><br>
            - Over 5 hrs schedule - deduct 30 minutes<br>
            - Over 6 hrs schedule - deduct 1 hour</p>
            <p><strong>6) Over 40 hrs in 1 week - overtime is at time and a half hours worked over 40 hours.</strong></p>
        </div>
    </div>
</body>
</html>`;

    console.log('✅ Desert Timesheet HTML generation complete');
    return html;
  }
}