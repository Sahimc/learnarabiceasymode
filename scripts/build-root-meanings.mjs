import fs from "node:fs";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract.mjs";

assertAuthoringContract("root-meaning build");

const sourcePath = process.env.ROOT_GLOSS_SOURCE;
if (!sourcePath)
  throw new Error(
    "ROOT_GLOSS_SOURCE must point to an approved Quranic root lexicon when building root meanings",
  );

const repoRoot = process.cwd();
const packagesRoot = path.join(repoRoot, "content-import", "surahs");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const arabicPattern =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/gu;

function normalizeRoot(value) {
  return String(value ?? "")
    .replace(/\s+/gu, "")
    .trim();
}

function cleanCandidate(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .replace(/[.!]+$/u, "")
    .trim();
}

function candidateScore(value) {
  const normalized = cleanCandidate(value);
  if (
    !normalized ||
    /lexical meaning|related forms|recognition/iu.test(normalized)
  )
    return -10000;
  const terms = normalized.split(/\s*[·,;/]\s*/u).filter(Boolean).length;
  const sentencePenalty = /[.!?]/u.test(normalized) ? 2 : 0;
  return terms * 10 - sentencePenalty - normalized.length / 1000;
}

function stripArabic(value) {
  return cleanCandidate(
    String(value ?? "")
      .replace(arabicPattern, " ")
      .replace(/\(\s*\)/gu, "")
      .replace(/\s+/gu, " ")
      .replace(/\s+([,.;:])/gu, "$1"),
  );
}

function sourceMeaning(value) {
  const text = cleanCandidate(value);
  if (!text) return "";

  const firstSentence = text.match(/^.*?(?:[.!?](?:\s|$)|$)/u)?.[0] ?? text;
  let result = firstSentence.trim();
  const patterns = [
    /^(?:The )?primary meaning of [^ ]+(?:\s+\([^)]*\))?\s+(?:primarily\s+)?(?:refers to|means|is)\s+/iu,
    /^The root [^ ]+(?:\s+\([^)]*\))?\s+(?:primarily\s+)?(?:means|refers to|describes|conveys|relates to|denotes|signifies|indicates|is)\s+/iu,
    /^(?:The )?(?:word|term)\s+"[^"]+"(?:\s+\([^)]*\))?\s+(?:primarily\s+)?(?:refers to|means|describes|is)\s+/iu,
  ];
  for (const pattern of patterns) {
    const match = result.match(pattern);
    if (match) {
      result = result.slice(match[0].length);
      break;
    }
  }
  result = stripArabic(result)
    .replace(/^the\s+/iu, "")
    .replace(/^to\s+/iu, "")
    .replace(/["“”]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return result;
}

const candidateMap = new Map();
for (const directory of fs.readdirSync(packagesRoot).sort()) {
  const file = path.join(packagesRoot, directory, "surah.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const lesson of Object.values(pkg.teachingEntries ?? {})) {
    const root = normalizeRoot(lesson.root);
    const picture = cleanCandidate(lesson.rootPicture);
    if (!root || !picture || picture.startsWith("word-family meaning:"))
      continue;
    const values = candidateMap.get(root) ?? new Map();
    values.set(picture, (values.get(picture) ?? 0) + 1);
    candidateMap.set(root, values);
  }
}

const meanings = {};
const missing = [];
const rootsToBuild = new Set([
  ...Object.keys(source).map(normalizeRoot),
  ...candidateMap.keys(),
]);
for (const root of rootsToBuild) {
  const entry = source[root];
  const candidates = candidateMap.get(root);
  const bestCandidate = candidates
    ? [...candidates.entries()].sort(
        (a, b) => candidateScore(b[0]) - candidateScore(a[0]) || b[1] - a[1],
      )[0]?.[0]
    : undefined;
  const fallback = sourceMeaning(entry?.m);
  const meaning = cleanCandidate(bestCandidate || fallback);
  if (
    !meaning ||
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(
      meaning,
    )
  ) {
    missing.push(root);
    continue;
  }
  meanings[root] = meaning;
}

if (missing.length)
  throw new Error(
    `Could not create English meanings for roots: ${missing.join(", ")}`,
  );

const outputPath = path.join(repoRoot, "content-import", "root-meanings.json");
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      description:
        "Reviewed learner-facing root-family meanings. Values are stable semantic ranges, never occurrence translations.",
      source:
        "Project-reviewed meanings, supplemented for missing roots from an approved Quranic root lexicon and condensed for learners.",
      meanings,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `Wrote ${Object.keys(meanings).length} root meanings to ${outputPath}.`,
);
