import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { discoverPackagePaths, repoRoot } from "./lib/packages";
import type { SurahPackage } from "../app/data/content-contract";

type Report = {
  adjudications: Array<{
    decision: string;
    occurrences: Array<{ occurrenceId: string }>;
    finalRows: Array<{ occurrenceId: string; forms: unknown[]; sarfReview: unknown }>;
  }>;
};

const reportPath = path.join(repoRoot, "artifacts", "content-review", "tier-b2-sarf-adjudications.json");
const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as Report;
const decisions = new Map<string, { forms: unknown[]; sarfReview: unknown }>();
for (const adjudication of report.adjudications) {
  for (const row of adjudication.finalRows) decisions.set(row.occurrenceId, { forms: row.forms, sarfReview: row.sarfReview });
}

const packagePaths = await discoverPackagePaths();
let replayed = 0;
async function writeWithRetry(filePath: string, value: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      await fs.writeFile(filePath, value, "utf8");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}
for (const filePath of packagePaths) {
  const relative = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
  const baseJson = execFileSync("git", ["show", `HEAD:${relative}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  const pkg = JSON.parse(baseJson) as SurahPackage;
  let changed = false;
  for (const ayah of pkg.ayahs) for (const word of ayah.words) {
    const decision = decisions.get(word.id);
    if (!decision || !word.teachingId) continue;
    const lesson = pkg.teachingEntries[word.teachingId];
    if (!lesson) throw new Error(`${word.id}: missing teaching entry in committed base`);
    lesson.forms = decision.forms as typeof lesson.forms;
    lesson.sarfReview = decision.sarfReview as typeof lesson.sarfReview;
    replayed++;
    changed = true;
  }
  if (changed && pkg.status === "custom-partial" && !Object.values(pkg.teachingEntries).some((lesson) => lesson.sarfReview.auditDecision === "blocked-for-genuine-ambiguity")) pkg.status = "custom-complete";
  // Always write the committed base back.  This removes unrelated drift from
  // broad review scripts, including packages with no B2 occurrence at all.
  await writeWithRetry(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
}
console.log(JSON.stringify({ base: "HEAD", replayedOccurrences: replayed, b2Occurrences: decisions.size }, null, 2));
