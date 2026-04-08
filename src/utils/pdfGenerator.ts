import jsPDF from "jspdf";

export async function generatePDF(compositePages: string[]) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [2480, 3508], // Letter size
  });

  compositePages.forEach((page, index) => {
    if (index !== 0) pdf.addPage();
    pdf.addImage(page, "PNG", 0, 0, 2480, 3508);
  });

  pdf.save("PunchCards.pdf");
}