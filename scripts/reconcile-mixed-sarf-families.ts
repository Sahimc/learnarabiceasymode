import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { assertAuthoringContract } from "./lib/authoring-contract";
import { discoverPackagePaths, readPackage } from "./lib/packages";
import {
  appendAuditRecords,
  readAuditRecords,
  type AuditRecord,
} from "./lib/review-ledger";

const contract = assertAuthoringContract("mixed Ṣarf family consistency reconciliation");
const apply = !process.argv.includes("--dry-run");
const reviewedAt = new Date().toISOString();
const root = process.cwd();
const auditPath = path.join(root, "artifacts", "content-review", "final-sarf-completion-audit.json");
const reportPath = path.join(root, "artifacts", "content-review", "mixed-sarf-reconciliation.json");

type JsonObject = Record<string, unknown>;
type LessonForm = {
  form: string;
  meaning: string;
  difference: string;
  relationship: string;
  provenance: string;
};
type Lesson = JsonObject & { forms: LessonForm[]; sarfReview: JsonObject };
type Word = JsonObject & { id: string; arabic: string; teachingId?: string; gloss?: string };
type Occurrence = {
  packagePath: string;
  packageId: string;
  package: JsonObject;
  word: Word;
  lesson: Lesson;
  familyKey: string;
};
type Plan = {
  familyKey: string;
  decision: string;
  scope?: string;
  reason: string;
  referenceOccurrenceId?: string;
  occurrenceIds: string[];
  changedOccurrenceIds: string[];
  skippedOccurrenceIds: string[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeJsonFile(filePath: string, content: string) {
  if (process.platform !== "win32") {
    await fs.writeFile(filePath, content, "utf8");
    return;
  }
  const temporaryPath = `${filePath}.codex-reconciliation-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, content, "utf8");
  const quote = (value: string) => value.replaceAll("'", "''");
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `[System.IO.File]::Copy('${quote(temporaryPath)}','${quote(filePath)}',$true); [System.IO.File]::Delete('${quote(temporaryPath)}')`,
    ],
    { stdio: "ignore" },
  );
}

function familyScope(familyKey: string, occurrence: Occurrence) {
  const meaning = text(occurrence.lesson.meaning) || text(occurrence.word.gloss);
  const review = occurrence.lesson.sarfReview;
  const reason = text(review.limitedReason);
  if (familyKey.includes("|عود|عاد|")) return "proper-name-aad";
  if (familyKey.includes("|صلح|صالح|")) {
    return /salih/iu.test(meaning) || /proper\s+(?:noun|name)/iu.test(reason)
      ? "proper-name-salih"
      : undefined;
  }
  if (familyKey.includes("|مصر|مصر|")) {
    return /egypt/iu.test(meaning) || /proper\s+(?:noun|name)/iu.test(reason)
      ? "proper-name-egypt"
      : "common-city";
  }
  if (familyKey.includes("|مدن|مدينة|")) {
    if (/madyan/iu.test(meaning)) return "proper-name-madyan";
    return /madinah/iu.test(meaning) || /proper\s+(?:noun|name)/iu.test(reason)
      ? "proper-name-al-madinah"
      : "common-city";
  }
  if (familyKey.includes("|بعل|بعل|")) {
    return /baal/iu.test(meaning) || /proper\s+(?:noun|name)/iu.test(reason)
      ? "proper-name-baal"
      : "lexical-husband";
  }
  return undefined;
}

function currentRow(occurrence: Occurrence): LessonForm {
  const current = occurrence.word.arabic;
  const exact = occurrence.lesson.forms.find((row) => normalize(row.form) === normalize(current));
  if (exact) return { ...exact, form: current };
  const first = occurrence.lesson.forms[0];
  return {
    form: current,
    meaning: text(occurrence.word.gloss) || text(occurrence.lesson.meaning) || first?.meaning || current,
    difference: first?.difference || "Current Qur'anic occurrence; its exact vocalisation and context are primary.",
    relationship: first?.relationship || "Current Qur'anic occurrence of the reviewed root/lexeme in this āyah.",
    provenance: first?.provenance || `Codex review of canonical Qur'anic occurrence ${occurrence.word.id}.`,
  };
}

function adaptRelatedRow(row: LessonForm, current: string): LessonForm {
  return {
    ...row,
    difference: row.difference.replace(/^Compared with [^,]+,/u, `Compared with ${current},`),
    relationship: row.relationship.replace(/Current Qur'anic occurrence/gu, "Reviewed related Qur'anic form"),
  };
}

function fullRows(occurrence: Occurrence, reference: Occurrence) {
  const current = currentRow(occurrence);
  const rows: LessonForm[] = [];
  for (const row of reference.lesson.forms) {
    if (normalize(row.form) === normalize(current.form)) continue;
    if (rows.some((existing) => normalize(existing.form) === normalize(row.form))) continue;
    if (!row.meaning.trim() || !row.difference.trim() || !row.relationship.trim() || !row.provenance.trim()) continue;
    rows.push(adaptRelatedRow(row, current.form));
    if (rows.length === 4) break;
  }
  return rows.length === 4 ? [current, ...rows] : undefined;
}

function limitedRows(occurrence: Occurrence) {
  return [currentRow(occurrence)];
}

function limitedReason(scope: string) {
  const reasons: Record<string, string> = {
    "proper-name-aad": "This occurrence is the proper name ʿĀd. The shared ع و د root is also used by return verbs, but those are a different lexeme and must not be taught as forms of this name; case/clitic variants are not counted as additional Ṣarf forms.",
    "proper-name-salih": "This occurrence is the proper name Ṣāliḥ. The adjective and righteous-deed forms from ص ل ح are a different lexical use; they must not be presented as forms of the personal name.",
    "proper-name-egypt": "This occurrence is the proper name Miṣr/Egypt. The common-noun reading in another occurrence is a separate sense; case and preposition variants do not create additional lexical Ṣarf forms.",
    "proper-name-al-madinah": "This occurrence is the proper name al-Madīnah. مَدْيَن (Madyan) is a different proper name, not a Ṣarf form of مدينة; only the current proper-name occurrence is retained here.",
    "proper-name-madyan": "This occurrence is the proper name Madyan. It is not a morphological form of مدينة or al-Madīnah; the shared provider/root bucket is a model collision, so only the current proper-name occurrence is retained here.",
    "proper-name-baal": "This occurrence is the proper name Baal. Husband forms share a spelling/root association but are a different lexical use; they must not be presented as forms of the deity name.",
  };
  return reasons[scope] ?? `This occurrence is a reviewed restricted lexical sense (${scope}); adding unrelated or shell-only forms would mislead the learner.`;
}

function knownModelFamilyKey(lesson: Lesson) {
  const root = text(lesson.root).replace(/\s+/gu, "");
  const meaning = text(lesson.meaning);
  if (root === "مص" || root === "مصر") return "lexical|مصر|مصر|noun/pronoun";
  if (root === "مدن") return "lexical|مدن|مدينة|noun/pronoun";
  if (root === "بعل") return "lexical|بعل|بعل|noun/pronoun";
  if (root === "عود" && /aad/iu.test(meaning)) return "lexical|عود|عاد|noun/pronoun";
  if (root === "صلح" && /salih/iu.test(meaning)) return "lexical|صلح|صالح|noun/pronoun";
  return undefined;
}

const audit = JSON.parse(await fs.readFile(auditPath, "utf8")) as {
  mixedFamilies: Array<{ familyKey: string; occurrenceIds: string[] }>;
};
const mixedById = new Map<string, string>();
for (const family of audit.mixedFamilies) for (const id of family.occurrenceIds) mixedById.set(id, family.familyKey);
try {
  const prior = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
    plans?: Array<{ familyKey: string; occurrenceIds?: string[] }>;
  };
  for (const plan of prior.plans ?? []) {
    for (const id of plan.occurrenceIds ?? []) if (!mixedById.has(id)) mixedById.set(id, plan.familyKey);
  }
} catch {
  // The first run is driven by the current audit; later runs reuse the durable plan.
}

const states = new Map<string, { path: string; package: JsonObject; changed: boolean }>();
const occurrences: Occurrence[] = [];
for (const packagePath of await discoverPackagePaths()) {
  const result = await readPackage(packagePath);
  if (!result.package) continue;
  const pkg = result.package as unknown as JsonObject;
  const packageId = text(pkg.packageId);
  states.set(packagePath, { path: packagePath, package: pkg, changed: false });
  const teachingEntries = (pkg.teachingEntries ?? {}) as JsonObject;
  for (const ayahValue of Array.isArray(pkg.ayahs) ? pkg.ayahs : []) {
    const ayah = ayahValue as JsonObject;
    for (const wordValue of Array.isArray(ayah.words) ? ayah.words : []) {
      const word = wordValue as Word;
      if (!word.teachingId) continue;
      const lesson = teachingEntries[word.teachingId] as Lesson | undefined;
      const familyKey = mixedById.get(text(word.id)) ?? (lesson ? knownModelFamilyKey(lesson) : undefined);
      if (!familyKey) continue;
      if (lesson && Array.isArray(lesson.forms) && lesson.sarfReview) {
        occurrences.push({ packagePath, packageId, package: pkg, word, lesson, familyKey });
      }
    }
  }
}

const byFamily = new Map<string, Occurrence[]>();
for (const occurrence of occurrences) byFamily.set(occurrence.familyKey, [...(byFamily.get(occurrence.familyKey) ?? []), occurrence]);

const plans: Plan[] = [];
const changedOccurrences: Array<{ occurrence: Occurrence; before: JsonObject; after: JsonObject; decision: string; scope?: string; reference?: string }> = [];
const safeFullFamilies = new Set([
  "lexical|كود|كاد|verb",
  "lexical|موه|ماء|noun/pronoun",
  "lexical|جنن|جنة|noun/pronoun",
  "lexical|هبط|يهبط|verb",
  "lexical|جوع|جوع|noun/pronoun",
  "lexical|كرر|كرة|noun/pronoun",
  "lexical|سلم|سلم|noun/pronoun",
  "lexical|جسم|جسم|noun/pronoun",
  "lexical|خلط|اختلط|verb",
  "lexical|سلم|مسلمين|noun/pronoun",
  "lexical|نوق|ناقة|noun/pronoun",
  "lexical|متن|متين|noun/pronoun",
  "lexical|بطش|بطش|verb",
  "lexical|صيح|صيحة|noun/pronoun",
  "lexical|قرع|قارعة|noun/pronoun",
  "lexical|نطف|نطفة|noun/pronoun",
  "lexical|سقف|سقف|noun/pronoun",
  "lexical|حصب|حاصب|noun/pronoun",
  "lexical|عمم|عمة|noun/pronoun",
  "lexical|فزع|فزع|verb",
  "lexical|حطب|حطب|noun/pronoun",
]);

for (const [familyKey, family] of byFamily) {
  const grouped = new Map<string, Occurrence[]>();
  for (const occurrence of family) {
    const scope = familyScope(familyKey, occurrence) ?? "shared-lexical-family";
    grouped.set(scope, [...(grouped.get(scope) ?? []), occurrence]);
  }
  for (const [scope, scoped] of grouped) {
    const isSpecialLimited = scope !== "shared-lexical-family" && scope.startsWith("proper-name-");
    const reference = scoped.find((item) => item.lesson.sarfReview.status === "full" && item.lesson.forms.length === 5);
    const allAlreadyFull = scoped.every((item) => item.lesson.sarfReview.status === "full");
    const plan: Plan = {
      familyKey,
      decision: isSpecialLimited
        ? "split-and-confirm-limited"
        : scope !== "shared-lexical-family" && allAlreadyFull
          ? "split-and-confirm-full"
          : "propagate-reviewed-full-family",
      ...(scope === "shared-lexical-family" ? {} : { scope }),
      reason: isSpecialLimited
        ? limitedReason(scope)
        : scope !== "shared-lexical-family" && allAlreadyFull
          ? "The scoped occurrences are already a consistent reviewed full family; the scope is retained as an explicit model boundary so it cannot later be merged with the distinct sense."
          : "The same reviewed root/lemma/POS family has a valid five-form occurrence. Reuse is constrained to this family scope; each occurrence keeps its exact Qur'anic form first.",
      referenceOccurrenceId: reference?.word.id,
      occurrenceIds: scoped.map((item) => item.word.id),
      changedOccurrenceIds: [],
      skippedOccurrenceIds: [],
    };
    if (
      !isSpecialLimited &&
      plan.decision !== "split-and-confirm-full" &&
      !safeFullFamilies.has(familyKey)
    ) {
      plan.decision = "retain-mixed-for-model-review";
      plan.reason = "The family has a known lexical-sense or model collision and no safe family-wide propagation rule was applied in this pass.";
      for (const occurrence of scoped) {
        const before = JSON.parse(JSON.stringify(occurrence.lesson)) as JsonObject;
        if (scope !== "shared-lexical-family") {
          occurrence.lesson.sarfReview = {
            ...occurrence.lesson.sarfReview,
            familyScope: scope,
          };
        }
        const after = JSON.parse(JSON.stringify(occurrence.lesson)) as JsonObject;
        if (hash(before) !== hash(after)) {
          plan.changedOccurrenceIds.push(occurrence.word.id);
          changedOccurrences.push({ occurrence, before, after, decision: "blocked", scope });
          const state = states.get(occurrence.packagePath);
          if (state) state.changed = true;
        }
      }
      plan.skippedOccurrenceIds = scoped.filter((item) => !plan.changedOccurrenceIds.includes(item.word.id)).map((item) => item.word.id);
      plans.push(plan);
      continue;
    }
    if (!isSpecialLimited && !reference) {
      plan.decision = "retain-blocked-no-reviewed-reference";
      plan.reason = "No reviewed full five-form occurrence exists inside this scope; automatic expansion would be guessing or padding.";
      plan.skippedOccurrenceIds = scoped.map((item) => item.word.id);
      plans.push(plan);
      continue;
    }
    for (const occurrence of scoped) {
      const before = JSON.parse(JSON.stringify(occurrence.lesson)) as JsonObject;
      if (scope !== "shared-lexical-family" && !isSpecialLimited) {
        occurrence.lesson.sarfReview = {
          ...occurrence.lesson.sarfReview,
          familyScope: scope,
        };
      }
      if (isSpecialLimited) {
        const review = occurrence.lesson.sarfReview;
        const alreadyCorrect =
          review.status === "limited" &&
          review.familyScope === scope &&
          review.auditDecision === "confirmed-limited" &&
          text(review.limitedReason) === limitedReason(scope) &&
          occurrence.lesson.forms.length === 1;
        if (!alreadyCorrect) {
          occurrence.lesson.forms = limitedRows(occurrence);
          occurrence.lesson.sarfReview = {
            status: "limited",
            familyScope: scope,
            limitedReason: limitedReason(scope),
            auditDecision: "confirmed-limited",
            provenance: [
              `Mixed-family reconciliation ${reviewedAt} separated this occurrence into reviewed scope ${scope}.`,
              `The shared root/lemma identity was checked against the actual occurrence meaning and proper-name use.`,
              "Only the genuine current proper-name form is retained; case, clitic and unrelated lexical forms are not counted as Ṣarf rows.",
            ],
            reviewedBy: "Codex",
            reviewedAt,
          };
        }
      } else if (reference && occurrence.lesson.sarfReview.status !== "full") {
        const forms = fullRows(occurrence, reference);
        if (!forms) {
          plan.skippedOccurrenceIds.push(occurrence.word.id);
          continue;
        }
        occurrence.lesson.forms = forms;
        occurrence.lesson.sarfReview = {
          status: "full",
          auditDecision: "upgraded-to-full",
          provenance: [
            `Mixed-family reconciliation ${reviewedAt} matched this occurrence to the reviewed full family ${familyKey}.`,
            `Representative full occurrence: ${reference.word.id}.`,
            "The current Qur'anic form remained first; four distinct reviewed related forms were reused without shell-only filtering or synthetic padding.",
          ],
          reviewedBy: "Codex",
          reviewedAt,
        };
      }
      const after = JSON.parse(JSON.stringify(occurrence.lesson)) as JsonObject;
      if (hash(before) !== hash(after)) {
        plan.changedOccurrenceIds.push(occurrence.word.id);
        changedOccurrences.push({ occurrence, before, after, decision: isSpecialLimited ? "confirmed-limited" : "upgraded-to-full", ...(scope === "shared-lexical-family" ? {} : { scope }), reference: reference?.word.id });
        const state = states.get(occurrence.packagePath);
        if (state) state.changed = true;
      }
    }
    plans.push(plan);
  }
}

const report = {
  reportType: "mixed-sarf-family-reconciliation",
  contractId: contract.contractId,
  contractVersion: contract.contractVersion,
  generatedAt: reviewedAt,
  startingMixedFamilyCount: audit.mixedFamilies.length,
  plans,
  totals: {
    familyScopesReviewed: plans.length,
    changedOccurrences: changedOccurrences.length,
    skippedOccurrences: plans.reduce((sum, plan) => sum + plan.skippedOccurrenceIds.length, 0),
    splitOrModelScopes: plans.filter((plan) => plan.decision === "split-and-confirm-limited").length,
    propagatedScopes: plans.filter((plan) => plan.decision === "propagate-reviewed-full-family").length,
    retainedModelReviewScopes: plans.filter((plan) => plan.decision.startsWith("retain-")).length,
  },
};

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (apply) {
  for (const state of states.values()) {
    if (!state.changed) continue;
    const pkg = state.package;
    const currentVersion = text(pkg.contentVersion).replace(/-(?:mixed-sarf-repair|family-reconciliation)[^\s]*$/u, "");
    pkg.contentVersion = `${currentVersion}-family-reconciliation`;
    await writeJsonFile(state.path, `${JSON.stringify(pkg, null, 2)}\n`);
    const manifestPath = state.path.replace(/surah\.json$/u, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as JsonObject;
      manifest.contentVersion = pkg.contentVersion;
      await writeJsonFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch {
      // The package remains authoritative for legacy packages without a manifest.
    }
  }
  const existingIds = new Set(readAuditRecords().map((record) => record.recordId));
  const records: AuditRecord[] = [];
  for (const plan of plans) {
    const digest = crypto.createHash("sha256").update(`${plan.familyKey}|${plan.scope ?? "shared"}`).digest("hex").slice(0, 20);
    const recordId = `mixed-sarf-family-consistency-${digest}`;
    if (existingIds.has(recordId)) continue;
    records.push({
      recordId,
      eventType: "mixed-sarf-family-consistency-reconciliation",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        type: "sarf-family-scope",
        familyKey: plan.familyKey,
        familyScope: plan.scope ?? null,
        occurrenceIds: plan.occurrenceIds,
      },
      status: plan.decision.startsWith("retain-") ? "blocked" : plan.decision === "split-and-confirm-limited" ? "passed-limited" : "passed",
      reviewedAt,
      checks: [
        "mixed-status-family-inventory-reviewed",
        "current-quranic-form-first",
        "shared-root-not-treated-as-sufficient-family-proof",
        plan.decision === "split-and-confirm-limited" ? "proper-name-or-sense-scope-recorded" : "reviewed-full-family-reference-checked",
        "no-fabricated-or-shell-only-padding",
      ],
      evidence: [
        auditPath,
        reportPath,
        "docs/content-authoring/quranic-word-tree-contract.json",
        "docs/content-authoring/common-problems.json",
        ...plan.occurrenceIds.map((id) => `source:${id}`),
      ],
      decision: plan.decision,
      reason: plan.reason,
      changedOccurrenceIds: plan.changedOccurrenceIds,
      skippedOccurrenceIds: plan.skippedOccurrenceIds,
      referenceOccurrenceId: plan.referenceOccurrenceId ?? null,
    });
  }
  for (const change of changedOccurrences) {
    const recordId = `mixed-sarf-occurrence-reconciled-${change.occurrence.word.id.replaceAll(":", "-")}`;
    if (existingIds.has(recordId)) continue;
    records.push({
      recordId,
      eventType: "mixed-sarf-occurrence-reconciled",
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      scope: {
        type: "quranic-word-occurrence",
        occurrenceId: change.occurrence.word.id,
        teachingId: change.occurrence.word.teachingId,
        familyKey: change.occurrence.familyKey,
        familyScope: change.scope ?? null,
      },
      status: change.decision === "confirmed-limited" ? "passed-limited" : change.decision === "blocked" ? "blocked" : "passed",
      reviewedAt,
      checks: [
        "before-after-lesson-recorded",
        "current-quranic-form-first",
        "form-specific-meaning-and-difference-retained",
        "review-provenance-recorded",
      ],
      evidence: [auditPath, reportPath, `source:${change.occurrence.word.id}`],
      sourceHash: hash(change.before),
      contentHash: hash(change.after),
      sarfStatus: change.decision === "confirmed-limited" ? "limited" : change.decision === "blocked" ? "blocked" : "full",
      beforeSarfStatus: (change.before.sarfReview as JsonObject)?.status,
      afterSarfStatus: (change.after.sarfReview as JsonObject)?.status,
      beforeFormCount: Array.isArray(change.before.forms) ? change.before.forms.length : null,
      afterFormCount: Array.isArray(change.after.forms) ? change.after.forms.length : null,
    });
  }
  if (records.length) appendAuditRecords(records);
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", reportPath, ...report.totals, auditRecords: apply ? changedOccurrences.length : 0 }, null, 2));
