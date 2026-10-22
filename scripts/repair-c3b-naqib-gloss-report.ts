import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "artifacts", "content-review", "tier-c3b-sarf-adjudications.json");
type ReportRow = { forms: Array<{ form: string; meaning: string }> };
type ReportItem = { familyKey: string; currentRows?: ReportRow[]; finalRows?: ReportRow[] };
const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as { adjudications: ReportItem[] };
const item = report.adjudications.find((entry) => entry.familyKey === "lexical|نقب|نقيب|noun/pronoun");
if (!item) throw new Error("The C3-B نقيب adjudication was not found.");
for (const row of [...(item.currentRows ?? []), ...(item.finalRows ?? [])]) {
  const form = row.forms.find((candidate) => candidate.form === "نَقِيبًا");
  if (form) form.meaning = "a leader / chief";
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, familyKey: item.familyKey, correctedMeaning: "a leader / chief" }, null, 2));
