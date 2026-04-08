// lib/CMSBillingTemplate.ts - FIXED LAYOUT AND DAY CALCULATION

import * as XLSX from 'sheetjs-style';

export interface BusinessCleaningRecord {
  business_id: number;
  business_name: string;
  address: string;
  cleaned_dates: number[];
  moved_dates: number[];
  added_dates: number[];
}

export interface BillingTemplateData {
  month: number;
  year: number;
  businesses: BusinessCleaningRecord[];
  generated_at: string;
  generated_by?: string;
}

export class CMSBillingTemplate {
  private data: BillingTemplateData;

  constructor(month: number, year: number) {
    this.data = {
      month,
      year,
      businesses: [],
      generated_at: new Date().toISOString()
    };
  }

  static async generateReport(businesses: BusinessCleaningRecord[], month: number, year: number, format: 'excel' | 'pdf'): Promise<Blob | string> {
    console.log(`🔧 FIXED: Generating ${format} report for ${month}/${year} with ${businesses.length} businesses`);
    const template = new CMSBillingTemplate(month, year);
    template.data.businesses = businesses.sort((a, b) => a.business_name.localeCompare(b.business_name));
    if (format === 'excel') {
      const arrayBuffer = template.generateExcel();
      return new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else {
      return template.generateHTML();
    }
  }

  private parseInstanceDate(dateString: string): number {
    console.log(`📅 FIXED: Parsing date: ${dateString}`);
    try {
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const day = parseInt(dateString.split('-')[2], 10);
        console.log(`  → FIXED: Direct day extraction: ${day}`);
        return day;
      }
      const parts = dateString.split('T')[0].split('-');
      const day = parseInt(parts[2], 10);
      console.log(`  → FIXED: Day from timestamp: ${day}`);
      return day;
    } catch (error) {
      console.error(`❌ FIXED: Error parsing date ${dateString}:`, error);
      return 0;
    }
  }

  async fetchCleaningData(): Promise<void> {
    try {
      console.log(`🔍 FIXED: Fetching cleaning data for ${this.data.month}/${this.data.year}`);
      const startDate = new Date(this.data.year, this.data.month - 1, 1);
      const endDate = new Date(this.data.year, this.data.month, 0);
      const startDateStr = `${this.data.year}-${String(this.data.month).padStart(2, '0')}-01`;
      const endDateStr = `${this.data.year}-${String(this.data.month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      console.log(`📅 FIXED: Date range: ${startDateStr} to ${endDateStr}`);

      const businessesRes = await fetch('/api/schedule/businesses');
      if (!businessesRes.ok) throw new Error('Failed to fetch businesses');
      const allBusinesses = await businessesRes.json();
      console.log(`✅ FIXED: Found ${allBusinesses.length} businesses`);

      const instancesRes = await fetch(`/api/schedule/daily-instances/monthly?start_date=${startDateStr}&end_date=${endDateStr}`);
      if (!instancesRes.ok) throw new Error('Failed to fetch monthly instances');
      const monthlyData = await instancesRes.json();
      console.log(`✅ FIXED: Found ${monthlyData.instances?.length || 0} instances`);

      const businessRecords = new Map<number, BusinessCleaningRecord>();
      allBusinesses.forEach((business: any) => {
        businessRecords.set(business.id, {
          business_id: business.id,
          business_name: business.business_name,
          address: business.address,
          cleaned_dates: [],
          moved_dates: [],
          added_dates: []
        });
      });

      monthlyData.instances?.forEach((instance: any) => {
        const dayOfMonth = this.parseInstanceDate(instance.instance_date);
        console.log(`📋 FIXED: Processing instance ${instance.id} for day ${dayOfMonth}`);
        instance.daily_clean_items?.forEach((item: any) => {
          const record = businessRecords.get(item.business_id);
          if (record) {
            console.log(`  🏢 FIXED: ${item.business_name}: status=${item.status}, day=${dayOfMonth}, is_added=${item.is_added}`);
            if (item.status === 'cleaned') {
              if (!record.cleaned_dates.includes(dayOfMonth)) {
                record.cleaned_dates.push(dayOfMonth);
                console.log(`    ✅ FIXED: Added to cleaned_dates: day ${dayOfMonth}`);
              }
            } else if (item.status === 'moved') {
              if (!record.moved_dates.includes(dayOfMonth)) {
                record.moved_dates.push(dayOfMonth);
                console.log(`    🔄 FIXED: Added to moved_dates: day ${dayOfMonth}`);
              }
            }
            if (item.is_added && item.status === 'cleaned') {
              if (!record.added_dates.includes(dayOfMonth)) {
                record.added_dates.push(dayOfMonth);
                console.log(`    ➕ FIXED: Added to added_dates: day ${dayOfMonth}`);
              }
            }
          }
        });
      });

      this.data.businesses = Array.from(businessRecords.values()).sort((a, b) => a.business_name.localeCompare(b.business_name));
      console.log(`✅ FIXED: Processed ${this.data.businesses.length} businesses for billing`);
      this.data.businesses.slice(0, 3).forEach(business => {
        console.log(`📋 FIXED: ${business.business_name}:`, {
          cleaned: business.cleaned_dates,
          moved: business.moved_dates, 
          added: business.added_dates
        });
      });
    } catch (error) {
      console.error('❌ FIXED: Error fetching cleaning data:', error);
      throw error;
    }
  }

  generateExcel(): ArrayBuffer {
    console.log('📊 FIXED: Generating Excel with proper layout and day placement');
    const wb = XLSX.utils.book_new();
    const monthName = this.getMonthName();
    const daysInMonth = new Date(this.data.year, this.data.month, 0).getDate();
    console.log(`📅 FIXED: Month: ${monthName}, Days in month: ${daysInMonth}`);
    const wsData: any[][] = [];

    wsData.push([`MONTHLY CLEANING REPORT FOR BILLING`]);
    wsData.push([]);
    wsData.push([`MONTH & YEAR: ${monthName.toUpperCase()} ${this.data.year}`]);
    wsData.push([]);

    console.log('📋 FIXED: Creating single-row header structure for all days 1-31');
    const headerRow = ['BUSINESS NAME'];
    for (let day = 1; day <= 31; day++) {
      headerRow.push(day.toString());
    }
    wsData.push(headerRow);

    console.log(`📋 FIXED: Header row length: ${headerRow.length} (1 business name + 31 days)`);

    this.data.businesses.forEach((business, index) => {
      console.log(`📋 FIXED: Processing business ${index + 1}: ${business.business_name}`);
      const row = [business.business_name];
      for (let day = 1; day <= 31; day++) {
        let mark = '';
        if (day <= daysInMonth) {
          if (business.added_dates.includes(day)) {
            mark = '+';
            console.log(`  ➕ FIXED: Day ${day}: Added`);
          } else if (business.cleaned_dates.includes(day)) {
            mark = '✓';
            console.log(`  ✅ FIXED: Day ${day}: Cleaned`);
          } else if (business.moved_dates.includes(day)) {
            mark = 'M';
            console.log(`  🔄 FIXED: Day ${day}: Moved`);
          }
        }
        row.push(mark);
      }
      wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = [{ wch: 22 }];
    for (let i = 0; i < 31; i++) {
      colWidths.push({ wch: 2.5 });
    }
    ws['!cols'] = colWidths;

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { v: '', t: 's' };
        }
        ws[cellAddress].s = {
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          },
          alignment: { horizontal: 'center', vertical: 'middle' }
        };

        if (R === 0) {
          ws[cellAddress].s.font = { bold: true, size: 14 };
          ws[cellAddress].s.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (R === 2) {
          ws[cellAddress].s.font = { bold: true, size: 12 };
          ws[cellAddress].s.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if (R === 4) {
          ws[cellAddress].s.font = { bold: true, size: 9 };
          ws[cellAddress].s.fill = { fgColor: { rgb: 'F0F0F0' } };
          ws[cellAddress].s.border = {
            top: { style: 'medium', color: { rgb: '000000' } },
            bottom: { style: 'medium', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          };
        } else if (R > 4) {
          if (C === 0) {
            ws[cellAddress].s.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            ws[cellAddress].s.font = { bold: true, size: 8 };
            ws[cellAddress].s.border.left = { style: 'medium', color: { rgb: '000000' } };
          } else {
            const cellValue = ws[cellAddress].v;
            if (cellValue === '✓') {
              ws[cellAddress].s.font = { color: { rgb: '006400' }, bold: true, size: 10 };
            } else if (cellValue === 'M') {
              ws[cellAddress].s.font = { color: { rgb: 'FF6600' }, bold: true, size: 10 };
            } else if (cellValue === '+') {
              ws[cellAddress].s.font = { color: { rgb: '0066CC' }, bold: true, size: 10 };
            }
          }
          if (C === range.e.c) {
            ws[cellAddress].s.border.right = { style: 'medium', color: { rgb: '000000' } };
          }
        }

        if (R === 1 || R === 3) {
          ws[cellAddress].s.border = {
            top: { style: 'none' },
            bottom: { style: 'none' },
            left: { style: 'none' },
            right: { style: 'none' }
          };
        }
      }
    }

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 31 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 31 } }
    ];

    const rowHeights = [];
    for (let i = 0; i <= range.e.r; i++) {
      if (i === 0) {
        rowHeights.push({ hpt: 24 });
      } else if (i === 1 || i === 3) {
        rowHeights.push({ hpt: 6 });
      } else if (i === 2) {
        rowHeights.push({ hpt: 18 });
      } else if (i === 4) {
        rowHeights.push({ hpt: 16 });
      } else {
        rowHeights.push({ hpt: 18 });
      }
    }
    ws['!rows'] = rowHeights;

    ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0, footer: 0 };
    ws['!pageSetup'] = { paperSize: 1, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
    XLSX.utils.book_append_sheet(wb, ws, 'CMS Billing');
    console.log('✅ FIXED: Excel generation complete with single-row layout');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true, cellNF: false, sheetStubs: false });
  }

  generateHTML(): string {
    console.log('🌐 FIXED: Generating HTML with single-row layout');
    const daysInMonth = new Date(this.data.year, this.data.month, 0).getDate();
    const monthName = this.getMonthName();
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CMS Billing - ${monthName} ${this.data.year}</title><style>@page { size: letter landscape; margin: 0.3in; }body{font-family: Arial, sans-serif;margin: 0;padding: 0;font-size: 8px;background: white;}table{border-collapse: collapse;width: 100%;border: 2px solid #000;font-size: 7px;}th, td{border: 1px solid #000;padding: 1px;text-align: center;vertical-align: middle;height: 16px;}.business-name{text-align: left;width: 120px;font-size: 6px;padding: 2px;font-weight: bold;}.day-header{width: 18px;font-weight: bold;background-color: #f0f0f0;font-size: 6px;}.day-cell{width: 18px;font-size: 8px;font-weight: bold;}.cleaned{color: #006400;}.moved{color: #FF6600;}.added{color: #0066CC;}.header{text-align: center;margin-bottom: 8px;border: 2px solid #000;padding: 4px;font-size: 10px;font-weight: bold;}.month-line{font-size: 8px;font-weight: bold;margin: 6px 0 4px 0;text-decoration: underline;}@media print{body { font-size: 7px; }}</style></head><body><div class="header">MONTHLY CLEANING REPORT FOR BILLING</div><div class="month-line">MONTH & YEAR: ${monthName.toUpperCase()} ${this.data.year}</div><table><thead><tr><th class="business-name">BUSINESS NAME</th>`;

    for (let day = 1; day <= 31; day++) {
      html += `<th class="day-header">${day}</th>`;
    }
    html += `</tr></thead><tbody>`;

    this.data.businesses.forEach(business => {
      html += `<tr><td class="business-name">${business.business_name}</td>`;
      for (let day = 1; day <= 31; day++) {
        let mark = '';
        let markClass = '';
        if (day <= daysInMonth) {
          if (business.added_dates.includes(day)) {
            mark = '+';
            markClass = 'added';
          } else if (business.cleaned_dates.includes(day)) {
            mark = '✓';
            markClass = 'cleaned';
          } else if (business.moved_dates.includes(day)) {
            mark = 'M';
            markClass = 'moved';
          }
        }
        const cellStyle = day > daysInMonth ? ' style="background-color: #f5f5f5;"' : '';
        html += `<td class="day-cell"${cellStyle}><span class="${markClass}">${mark}</span></td>`;
      }
      html += `</tr>`;
    });

    html += `</tbody></table></body></html>`;
    console.log('✅ FIXED: HTML generation complete with single-row layout');
    return html;
  }

  private getMonthName(): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[this.data.month - 1];
  }

  static async generateMonthlyReport(month: number, year: number, format: 'html' | 'excel' = 'html'): Promise<string | ArrayBuffer> {
    console.log(`🔧 FIXED: Generating monthly report for ${month}/${year} as ${format}`);
    const template = new CMSBillingTemplate(month, year);
    await template.fetchCleaningData();
    if (format === 'excel') {
      return template.generateExcel();
    } else {
      return template.generateHTML();
    }
  }
}