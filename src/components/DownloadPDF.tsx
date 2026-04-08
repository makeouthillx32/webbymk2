"use client";

import React from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface DownloadPDFProps {
  sheets: string[];
}

const DownloadPDF: React.FC<DownloadPDFProps> = ({ sheets }) => {
  const generatePDF = async () => {
    if (sheets.length === 0) {
      console.error("No sheets available to generate a PDF.");
      return;
    }

    const pdf = new jsPDF("portrait", "px", "letter"); // Letter size: 8.5 x 11 inches

    for (let i = 0; i < sheets.length; i++) {
      if (i > 0) pdf.addPage();
      const img = new Image();
      img.src = sheets[i];

      await new Promise((resolve) => {
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          if (ctx) {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imgData = canvas.toDataURL("image/png");
            pdf.addImage(imgData, "PNG", 20, 20, 550, 750);
          }
          resolve(true);
        };
      });
    }

    pdf.save("PunchCards.pdf");
  };

  return (
    <button className="mt-6 p-3 bg-green-600 text-white rounded" onClick={generatePDF}>
      Download as PDF
    </button>
  );
};

export default DownloadPDF;