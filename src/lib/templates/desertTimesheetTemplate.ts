// lib/templates/desertTimesheetTemplate.ts - Pure template functions
import * as XLSX from 'sheetjs-style';

function convertTimeToString(hour: number, minute: number, ampm: string): string {
  return `${hour}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

export function generateDesertTimesheetExcel(employeeName: string, payrollPeriod: 1 | 2, weeks: any[]): ArrayBuffer {
  // Prepare timesheet data
  const timesheetRows: Array<{ timeIn: string; timeOut: string; }> = [];
  weeks.forEach(week => {
    week.rows.forEach((row: any) => {
      timesheetRows.push({
        timeIn: convertTimeToString(row.starthour, row.startminute, row.startampm),
        timeOut: convertTimeToString(row.endhour, row.endminute, row.endampm)
      });
    });
  });

  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];

  // Build exact form layout
  wsData.push(['DESERT AREA RESOURCES & TRAINING', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  wsData.push(['TIME SHEET', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  wsData.push([`Employee's Name: ${employeeName}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Type/Burns:']);
  wsData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

  // Column headers
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

  // 15 data rows for dates 16-31
  for (let i = 0; i < 15; i++) {
    const date = i + 16;
    const rowData = timesheetRows[i] || {};
    wsData.push([
      date, '', '', '', '', '', '', '', '', '', '', '',
      rowData.timeOut || '', rowData.timeIn || '', '', '', date
    ]);
  }

  // Total row
  wsData.push(['TOTAL HRS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '31']);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 8 }
  ];

  // Apply styling
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { v: '', t: 's' };

      ws[cellAddress].s = {
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
      };

      if (R === 0 || R === 1) {
        ws[cellAddress].s.font = { bold: true, size: R === 0 ? 16 : 14 };
      } else if (R === 3) {
        ws[cellAddress].s.font = { bold: true, size: 11 };
        ws[cellAddress].s.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (R === 5) {
        ws[cellAddress].s.font = { bold: true, size: 8 };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'F0F0F0' } };
      } else if (R === wsData.length - 1) {
        ws[cellAddress].s.font = { bold: true, size: 10 };
        ws[cellAddress].s.fill = { fgColor: { rgb: 'E0E0E0' } };
      }
    }
  }

  // Merge headers
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } }
  ];

  // Page setup
  ws['!pageSetup'] = { paperSize: 1, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };

  XLSX.utils.book_append_sheet(wb, ws, 'Desert Timesheet');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
}

export function generateDesertTimesheetHTML(employeeName: string, payrollPeriod: 1 | 2, weeks: any[]): string {
  const timesheetRows: Array<{ timeIn: string; timeOut: string; }> = [];
  weeks.forEach(week => {
    week.rows.forEach((row: any) => {
      timesheetRows.push({
        timeIn: convertTimeToString(row.starthour, row.startminute, row.startampm),
        timeOut: convertTimeToString(row.endhour, row.endminute, row.endampm)
      });
    });
  });

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Desert Area Resources & Training - Time Sheet</title>
    <style>
        @page { size: 8.5in 11in; margin: 0.5in; }
        body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 0; }
        .container { width: 100%; border: 2px solid black; padding: 10px; }
        .header { text-align: center; margin-bottom: 15px; }
        .header h1 { font-size: 16px; font-weight: bold; margin: 0; }
        .header h2 { font-size: 14px; font-weight: bold; margin: 5px 0 0 0; }
        .form-row { display: flex; margin-bottom: 8px; }
        .form-field { margin-right: 20px; }
        .form-field label { font-weight: bold; margin-right: 5px; font-size: 9px; }
        .form-field input { border: none; border-bottom: 1px solid black; padding: 2px; min-width: 120px; }
        .time-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .time-table th, .time-table td { border: 1px solid black; padding: 4px; text-align: center; font-size: 9px; }
        .time-table th { background-color: #f0f0f0; font-weight: bold; }
        .rotated-header { writing-mode: vertical-rl; text-orientation: mixed; min-width: 25px; height: 120px; }
        .signature-section { display: flex; justify-content: space-between; margin-top: 20px; }
        .signature-line { border-bottom: 1px solid black; height: 20px; width: 200px; }
        .checkbox { width: 12px; height: 12px; border: 1px solid black; display: inline-block; margin-right: 5px; ${payrollPeriod === 1 ? 'background: black;' : ''} }
        .checkbox2 { width: 12px; height: 12px; border: 1px solid black; display: inline-block; margin-right: 5px; ${payrollPeriod === 2 ? 'background: black;' : ''} }
        @media print { body { print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>DESERT AREA RESOURCES & TRAINING</h1>
            <h2>TIME SHEET</h2>
        </div>
        
        <div class="form-row">
            <div class="form-field">
                <label>Employee's Name:</label>
                <input type="text" value="${employeeName}" readonly>
            </div>
        </div>
        
        <table class="time-table">
            <thead>
                <tr>
                    <th>DATE</th>
                    <th class="rotated-header">Employee's Signature & date</th>
                    <th class="rotated-header">Base Hours</th>
                    <th class="rotated-header">late scheduled in Tool Hr</th>
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
                    <th>DATE</th>
                </tr>
            </thead>
            <tbody>
                ${Array.from({ length: 15 }, (_, i) => {
                  const date = i + 16;
                  const rowData = timesheetRows[i] || {};
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
                <tr style="background-color: #f5f5f5; font-weight: bold;">
                    <td><strong>TOTAL HRS</strong></td>
                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                    <td><strong>31</strong></td>
                </tr>
            </tbody>
        </table>
        
        <div class="signature-section">
            <div>
                <label>Supervisor's Signature & date</label>
                <div class="signature-line"></div>
            </div>
            <div>
                <label>Payroll Period:</label>
                <div style="margin-top: 10px;">
                    <span class="checkbox"></span>1st
                    <span class="checkbox2"></span>2nd
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}