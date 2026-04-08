import html2canvas from "html2canvas";

export async function generateIndividualPunchCards(
  selectedTemplate: string,
  numPunchCards: number
) {
  const individualCards: string[] = [];

  for (let i = 0; i < numPunchCards; i++) {
    const cardElement = document.createElement("div");
    cardElement.style.width = "1088px"; // Punch card size
    cardElement.style.height = "638px";
    cardElement.style.overflow = "hidden";

    const img = new Image();
    img.src = `/images/${selectedTemplate}`;
    img.style.width = "100%";
    img.style.height = "100%";

    cardElement.appendChild(img);
    document.body.appendChild(cardElement);

    const canvas = await html2canvas(cardElement);
    individualCards.push(canvas.toDataURL("image/png"));

    document.body.removeChild(cardElement);
  }

  return individualCards;
}