import { createWorker } from "tesseract.js";
import fs from "node:fs";

/**
 * OCR a screenshot with visible steps + date, return normalized {dateISO, steps}
 * This is a best-effort stub; quality depends on screenshot clarity & language.
 */
async function main() {
  const img = process.argv[2];
  const outJson = process.argv[3] || "data/ocr_result.json";
  if (!img) throw new Error("Usage: hardhat run scripts/ingest/ocr_screenshot.ts -- <imagePath> [outJson]");
  const worker = await createWorker();
  await worker.loadLanguage("eng");
  await worker.initialize("eng");
  const { data: { text } } = await worker.recognize(img);
  await worker.terminate();

  // naive extraction: find YYYY-MM-DD or DD.MM.YYYY and a number near "steps"
  const date = (text.match(/\d{4}-\d{2}-\d{2}/) || text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/))?.[0] || "";
  const stepsMatch = text.match(/(\d[\d,\.]{3,})\s*steps/i) || text.match(/steps\s*(\d[\d,\.]{3,})/i);
  const steps = stepsMatch ? Number(String(stepsMatch[1]).replace(/[^\d]/g,"")) : 0;

  const iso = date.includes(".") ? toISODate(date) : date;
  const out = { date: iso, steps, rawText: text.slice(0,500) };
  fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
  console.log("OCR_OUT:", out);
}

function toISODate(d: string): string {
  const [dd, mm, yyyy] = d.split(".");
  return `${yyyy}-${mm}-${dd}`;
}

main().catch(e => { console.error(e); process.exit(1); });
