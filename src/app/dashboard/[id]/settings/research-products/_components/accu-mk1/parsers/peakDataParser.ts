/**
 * HPLC & Mass Spec Peak Data Parser
 * Ported from Accu-Mk1 peakdata_csv_parser.py & txt_parser.py
 */

export interface HPLCPeak {
  peakNumber: number;
  retentionTime: number; // minutes
  area: number;
  height: number;
  areaPercent: number; // purity contribution %
  compoundName?: string;
}

export interface HPLCAnalysisResult {
  filename: string;
  totalArea: number;
  mainPeakRetentionTime: number;
  mainPeakPurity: number; // main peak % area
  peaks: HPLCPeak[];
  isPassed: boolean; // Purity >= 98.0%
}

export function parseChromatogramCSV(csvContent: string, filename: string = "chromatogram.csv"): HPLCAnalysisResult {
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const peaks: HPLCPeak[] = [];
  let totalArea = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip headers
    if (line.toLowerCase().includes("retention") || line.toLowerCase().includes("peak")) continue;

    const parts = line.split(/[,;\t]+/).map((p) => p.trim());
    if (parts.length >= 3) {
      const peakNum = parseInt(parts[0], 10) || i + 1;
      const rt = parseFloat(parts[1]);
      const area = parseFloat(parts[2]);
      const height = parts[3] ? parseFloat(parts[3]) : 0;

      if (!isNaN(rt) && !isNaN(area)) {
        peaks.push({
          peakNumber: peakNum,
          retentionTime: rt,
          area,
          height: isNaN(height) ? 0 : height,
          areaPercent: 0,
        });
        totalArea += area;
      }
    }
  }

  // Calculate area percentages & identify main peak
  let maxArea = 0;
  let mainRt = 0;
  let mainPurity = 0;

  peaks.forEach((peak) => {
    peak.areaPercent = totalArea > 0 ? (peak.area / totalArea) * 100 : 0;
    if (peak.area > maxArea) {
      maxArea = peak.area;
      mainRt = peak.retentionTime;
      mainPurity = peak.areaPercent;
    }
  });

  return {
    filename,
    totalArea: Math.round(totalArea * 100) / 100,
    mainPeakRetentionTime: Math.round(mainRt * 1000) / 1000,
    mainPeakPurity: Math.round(mainPurity * 100) / 100,
    peaks,
    isPassed: mainPurity >= 98.0,
  };
}
