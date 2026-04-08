import jsPDF from "jspdf";

const A4_WIDTH = 2480; // 8.5" x 11" at 300 DPI
const A4_HEIGHT = 3508;
const CARD_WIDTH = 1088;
const CARD_HEIGHT = 638;
const COLS = 2;
const ROWS = 5;
const SPACING = 20;

export async function createCompositePages(individualPunchCards: string[]) {
  const pages: string[] = [];

  for (let i = 0; i < individualPunchCards.length; i += COLS * ROWS) {
    const canvas = document.createElement("canvas");
    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT;
    const ctx = canvas.getContext("2d");

    if (!ctx) continue;
    ctx.fillStyle = "#FFF";
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    for (let j = 0; j < COLS * ROWS; j++) {
      if (i + j >= individualPunchCards.length) break;

      const x = (j % COLS) * (CARD_WIDTH + SPACING);
      const y = Math.floor(j / COLS) * (CARD_HEIGHT + SPACING);
      const img = new Image();
      img.src = individualPunchCards[i + j];

      await new Promise((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, x, y, CARD_WIDTH, CARD_HEIGHT);
          resolve(true);
        };
      });
    }

    pages.push(canvas.toDataURL("image/png"));
  }

  return pages;
}