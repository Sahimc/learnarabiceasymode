import fs from "node:fs";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract.mjs";

assertAuthoringContract("root-picture repair");

const repoRoot = process.cwd();
const packagesRoot = path.join(repoRoot, "content-import", "surahs");
const rootMeaningData = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "content-import", "root-meanings.json"),
    "utf8",
  ),
);

function normalizeRoot(root) {
  return String(root ?? "")
    .replace(/\s+/gu, "")
    .trim();
}

function repairRootlessPicture(picture) {
  const match = String(picture)
    .trim()
    .match(/^No lexical root \(([^()]+)\) — (.*)$/u);
  if (!match) return String(picture).trim();
  const [, category, explanation] = match;
  const supplied = explanation.match(
    /^(.*?) is supplied by this (?:grammatical )?(?:grammatical )?(?:word|article|preposition|connector|pronoun|ending)\.?$/iu,
  );
  if (!supplied) return String(picture).trim();
  return `No lexical root (${category}) — ${supplied[1].trim().replace(/[.]$/u, "")}.`;
}

let packagesChanged = 0;
let lexicalFixed = 0;
let rootlessFixed = 0;
let rootFormMeaningsFixed = 0;
const changedSurahs = [];

for (const directory of fs.readdirSync(packagesRoot).sort()) {
  const file = path.join(packagesRoot, directory, "surah.json");
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, "utf8");
  const pkg = JSON.parse(raw);
  if (
    (pkg.surah.number < 51 && pkg.surah.number !== 1) ||
    pkg.surah.number > 114
  )
    continue;

  let changed = false;
  for (const lesson of Object.values(pkg.teachingEntries ?? {})) {
    if (String(lesson.root ?? "").trim()) {
      const root = normalizeRoot(lesson.root);
      const expected = rootMeaningData.meanings[root];
      if (!expected)
        throw new Error(
          `${pkg.surah.number}/${lesson.id}: missing root meaning for ${root}`,
        );
      if (lesson.rootPicture !== expected) {
        lesson.rootPicture = expected;
        lexicalFixed += 1;
        changed = true;
      }
      for (const form of lesson.forms ?? []) {
        if (form.difference === "root skeleton" && form.meaning !== expected) {
          form.meaning = expected;
          rootFormMeaningsFixed += 1;
          changed = true;
        }
      }
    } else {
      const expected = repairRootlessPicture(lesson.rootPicture);
      if (lesson.rootPicture !== expected) {
        lesson.rootPicture = expected;
        rootlessFixed += 1;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    packagesChanged += 1;
    changedSurahs.push(pkg.surah.number);
  }
}

console.log(
  JSON.stringify(
    {
      packagesChanged,
      changedSurahs,
      lexicalFixed,
      rootlessFixed,
      rootFormMeaningsFixed,
    },
    null,
    2,
  ),
);
