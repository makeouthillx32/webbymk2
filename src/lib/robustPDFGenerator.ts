// lib/robustPDFGenerator.ts

export interface BusinessCleaningRecord {
  business_id: number;
  business_name: string;
  address: string;
  cleaned_dates: number[];
}

export class RobustPDFGenerator {
  static async generateBillingPDF(businesses: BusinessCleaningRecord[], month: number, year: number): Promise<Blob> {
    try {
      // Dynamic import to avoid SSR issues
      const { jsPDF } = await import('jspdf');
      
      // Create PDF with proper settings
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true,
        compress: true
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const daysInMonth = new Date(year, month, 0).getDate();
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthName = monthNames[month - 1];

      // Calculate table dimensions
      const businessNameWidth = 60;
      const availableWidth = pageWidth - margin * 2 - businessNameWidth;
      const dayWidth = Math.max(availableWidth / daysInMonth, 4); // Minimum 4mm per day
      const rowHeight = 8;
      const headerHeight = 12;

      // Header section
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('DART COMMERCIAL SERVICES', pageWidth / 2, 20, { align: 'center' });
      
      pdf.setFontSize(14);
      pdf.text('MONTHLY BILLING REPORT', pageWidth / 2, 30, { align: 'center' });
      
      pdf.setFontSize(12);
      pdf.text(`${monthName.toUpperCase()} ${year}`, pageWidth / 2, 40, { align: 'center' });

      // Table start position
      let currentY = 50;
      const tableStartY = currentY;

      // Function to draw table headers
      const drawHeaders = (y: number) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        
        // Business name header
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.5);
        pdf.rect(margin, y, businessNameWidth, headerHeight);
        pdf.text('BUSINESS NAME', margin + 2, y + 8);
        
        // Day headers
        pdf.setFontSize(8);
        for (let day = 1; day <= daysInMonth; day++) {
          const x = margin + businessNameWidth + (day - 1) * dayWidth;
          pdf.rect(x, y, dayWidth, headerHeight);
          
          // Center the day number
          const textWidth = pdf.getTextWidth(day.toString());
          const textX = x + (dayWidth - textWidth) / 2;
          pdf.text(day.toString(), textX, y + 8);
        }
        
        return y + headerHeight;
      };

      // Draw initial headers
      currentY = drawHeaders(currentY);

      // Business rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      
      businesses.forEach((business, index) => {
        // Check if we need a new page
        if (currentY + rowHeight > pageHeight - margin - 20) {
          pdf.addPage();
          currentY = margin + 10;
          // Redraw headers on new page
          currentY = drawHeaders(currentY);
        }

        // Business name cell
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.3);
        pdf.rect(margin, currentY, businessNameWidth, rowHeight);
        
        // Truncate business name if too long
        let businessName = business.business_name;
        const maxWidth = businessNameWidth - 4;
        while (pdf.getTextWidth(businessName) > maxWidth && businessName.length > 3) {
          businessName = businessName.substring(0, businessName.length - 4) + '...';
        }
        
        pdf.text(businessName, margin + 2, currentY + 5);

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
          const x = margin + businessNameWidth + (day - 1) * dayWidth;
          pdf.rect(x, currentY, dayWidth, rowHeight);
          
          if (business.cleaned_dates.includes(day)) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            
            // Center the checkmark
            const checkmark = '✓';
            const textWidth = pdf.getTextWidth(checkmark);
            const textX = x + (dayWidth - textWidth) / 2;
            pdf.text(checkmark, textX, currentY + 6);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
          }
        }

        currentY += rowHeight;
      });

      // Footer section
      currentY += 15;
      if (currentY + 30 > pageHeight - margin) {
        pdf.addPage();
        currentY = margin + 20;
      }

      // Signature section
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      
      const signatureY = currentY;
      pdf.text('JOB COACH SIGNATURE:', margin, signatureY);
      pdf.setLineWidth(0.5);
      pdf.line(margin + 55, signatureY + 2, margin + 120, signatureY + 2);
      
      pdf.text('DATE:', pageWidth - margin - 50, signatureY);
      pdf.line(pageWidth - margin - 35, signatureY + 2, pageWidth - margin - 5, signatureY + 2);

      // Add metadata
      pdf.setProperties({
        title: `CMS Billing Report - ${monthName} ${year}`,
        subject: 'Monthly Billing Report',
        author: 'DART Commercial Services',
        creator: 'CMS Application',
        producer: 'jsPDF'
      });

      // Generate blob with proper MIME type
      const pdfOutput = pdf.output('blob', { type: 'application/pdf' });
      
      // Validate the blob
      if (!pdfOutput || pdfOutput.size === 0) {
        throw new Error('Generated PDF is empty');
      }

      console.log(`✅ PDF generated successfully: ${pdfOutput.size} bytes`);
      return pdfOutput;

    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Alternative: Generate using HTML-to-PDF approach with proper canvas handling
  static async generateBillingPDFFromHTML(businesses: BusinessCleaningRecord[], month: number, year: number): Promise<Blob> {
    try {
      // Dynamic imports
      const { jsPDF } = await import('jspdf');
      const html2canvas = await import('html2canvas');
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthName = monthNames[month - 1];
      const daysInMonth = new Date(year, month, 0).getDate();

      // Create optimized HTML for PDF conversion
      const htmlContent = `
        <div style="width: 1123px; height: 794px; padding: 20px; font-family: Arial, sans-serif; background: white; box-sizing: border-box;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">DART COMMERCIAL SERVICES</h1>
            <h2 style="margin: 10px 0; font-size: 18px;">MONTHLY BILLING REPORT</h2>
            <h3 style="margin: 10px 0; font-size: 16px; text-transform: uppercase;">${monthName} ${year}</h3>
          </div>
          
          <table style="border-collapse: collapse; width: 100%; font-size: 10px;">
            <thead>
              <tr>
                <th style="border: 1px solid black; padding: 4px; background: #f0f0f0; width: 150px; text-align: left;">BUSINESS NAME</th>
                ${Array.from({length: daysInMonth}, (_, i) => 
                  `<th style="border: 1px solid black; padding: 4px; background: #f0f0f0; width: 20px; text-align: center;">${i + 1}</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${businesses.map(business => `
                <tr>
                  <td style="border: 1px solid black; padding: 4px; text-align: left; font-weight: bold;">
                    ${business.business_name.length > 25 ? business.business_name.substring(0, 22) + '...' : business.business_name}
                  </td>
                  ${Array.from({length: daysInMonth}, (_, i) => {
                    const day = i + 1;
                    const isCleaned = business.cleaned_dates.includes(day);
                    return `<td style="border: 1px solid black; padding: 4px; text-align: center; font-weight: bold; font-size: 14px;">
                      ${isCleaned ? '✓' : ''}
                    </td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: bold; font-size: 14px;">
              JOB COACH SIGNATURE: <span style="display: inline-block; width: 200px; border-bottom: 2px solid black; margin-left: 10px;"></span>
            </div>
            <div style="font-weight: bold; font-size: 14px;">
              DATE: <span style="display: inline-block; width: 150px; border-bottom: 2px solid black; margin-left: 10px;"></span>
            </div>
          </div>
        </div>
      `;

      // Create temporary container
      const container = document.createElement('div');
      container.innerHTML = htmlContent;
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '-9999px';
      document.body.appendChild(container);

      try {
        // Generate canvas
        const canvas = await html2canvas.default(container.firstElementChild as HTMLElement, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          width: 1123,
          height: 794,
          logging: false
        });

        // Create PDF
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [1123, 794]
        });

        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', 0, 0, 1123, 794);

        // Add metadata
        pdf.setProperties({
          title: `CMS Billing Report - ${monthName} ${year}`,
          subject: 'Monthly Billing Report',
          author: 'DART Commercial Services'
        });

        const pdfBlob = pdf.output('blob');
        return pdfBlob;

      } finally {
        // Clean up
        document.body.removeChild(container);
      }

    } catch (error) {
      console.error('❌ Error generating PDF from HTML:', error);
      throw new Error(`HTML-to-PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}