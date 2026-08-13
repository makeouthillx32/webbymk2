// src/scripts/copy-unenter-logo.ts
import fs from "fs";
import path from "path";

const srcPath = "C:\\Users\\skill\\.gemini\\antigravity\\brain\\e9beba7a-f56f-4d1d-9976-285c39806ee3\\.user_uploaded\\media_1785782530827.png";
const destDir = "Z:\\WEBSITES\\webbymk2\\public\\images\\logo";
const destPath = path.join(destDir, "unenter-logo-spiky.png");

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(srcPath, destPath);
console.log("✓ Successfully copied UNENTER spiky logo to", destPath);
