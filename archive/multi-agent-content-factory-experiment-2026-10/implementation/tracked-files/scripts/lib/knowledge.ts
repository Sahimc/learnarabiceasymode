import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  KnowledgeSnapshotSchema,
  type KnowledgeSnapshot,
} from "../../app/data/content-production-contract";
import { repoRoot } from "./packages";

const knowledgeRoot = path.join(
  repoRoot,
  "content-authoring",
  "production-knowledge",
);

const fixedKnowledgeFiles = [
  "knowledge-version.json",
  "learner-context/form-families.json",
  "learner-context/grammar-concepts.json",
  "learner-context/particles.json",
  "learner-context/terminology.json",
  "lexical-registry/occurrence-exceptions.json",
  "lexical-registry/shared-lessons.json",
  "safeguards/common-problems.json",
  "safeguards/reviewer-rules.json",
  "safeguards/source-policy.json",
] as const;

const sourceKnowledgeFiles = [
  "content-import/sources/qac/morphology-overrides.json",
] as const;

export const knowledgeSnapshotPaths = [
  ...fixedKnowledgeFiles.map((item) =>
    path.join("content-authoring", "production-knowledge", item),
  ),
  ...sourceKnowledgeFiles,
];

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function readKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
  const files = [];
  for (const relativePath of fixedKnowledgeFiles) {
    const absolutePath = path.join(knowledgeRoot, relativePath);
    const raw = await fs.readFile(absolutePath, "utf8");
    files.push({
      path: path
        .join("content-authoring", "production-knowledge", relativePath)
        .replaceAll("\\", "/"),
      checksum: digest(raw),
    });
  }
  for (const relativePath of sourceKnowledgeFiles) {
    const raw = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
    files.push({
      path: relativePath.replaceAll("\\", "/"),
      checksum: digest(raw),
    });
  }
  const versionRaw = await fs.readFile(
    path.join(knowledgeRoot, "knowledge-version.json"),
    "utf8",
  );
  const version = (JSON.parse(versionRaw) as { knowledgeVersion?: string })
    .knowledgeVersion;
  if (!version)
    throw new Error("knowledge-version.json is missing knowledgeVersion");
  const snapshotId = digest(JSON.stringify({ version, files }));
  return KnowledgeSnapshotSchema.parse({ snapshotId, version, files });
}
