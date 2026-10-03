import fs from "node:fs/promises";
import path from "node:path";
import {
  ContentDraftSchema,
  ContentIssueSchema,
  IssueManifestSchema,
  ReviewArtifactSchema,
  ReviewScopeSchema,
  SourcePacketSchema,
  draftHasAuthoredContent,
  validateDraftAgainstPacket,
  layerStateForSourceOnly,
  type ContentDraft,
  type ContentIssue,
  type IssueManifest,
  type ReviewArtifact,
  type SourcePacket,
} from "../app/data/content-production-contract";
import { buildSourcePacket } from "../app/data/content-production-source";
import { assembleAuthoredSurah } from "../app/data/content-production-assembler";
import { discoverPackagePaths, readPackage, repoRoot } from "./lib/packages";
import { loadLocalEnv } from "./lib/env";
import { pool } from "./lib/db";
import { readKnowledgeSnapshot } from "./lib/knowledge";

loadLocalEnv();

const authoringRoot = path.join(repoRoot, "content-authoring");
const sourceRoot = path.join(authoringRoot, "source-packets");
const draftRoot = path.join(authoringRoot, "drafts");
const reviewRoot = path.join(authoringRoot, "reviews");
const assembledRoot = path.join(authoringRoot, "assembled");
const pilotRoot = path.join(authoringRoot, "pilots");

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const surahIndex = args.indexOf("--surah");
const surahNumber = surahIndex >= 0 ? Number(args[surahIndex + 1]) : NaN;
const roleIndex = args.indexOf("--role");
const reviewerRole = roleIndex >= 0 ? args[roleIndex + 1] : "morphology";
const reviewerIndex = args.indexOf("--reviewer");
const reviewerIdentity =
  reviewerIndex >= 0 ? args[reviewerIndex + 1] : undefined;
const revisionIndex = args.indexOf("--revision");
const revision = revisionIndex >= 0 ? Number(args[revisionIndex + 1]) : 1;
const workerIndex = args.indexOf("--worker");
const workerId = workerIndex >= 0 ? args[workerIndex + 1] : "content-factory";
const ayahStartIndex = args.indexOf("--ayah-start");
const ayahEndIndex = args.indexOf("--ayah-end");
const requestedAyahStart =
  ayahStartIndex >= 0 ? Number(args[ayahStartIndex + 1]) : undefined;
const requestedAyahEnd =
  ayahEndIndex >= 0 ? Number(args[ayahEndIndex + 1]) : undefined;
const reviewAyahIndex = args.indexOf("--ayah");
const reviewAyah =
  reviewAyahIndex >= 0 ? Number(args[reviewAyahIndex + 1]) : undefined;
const draftFileIndex = args.indexOf("--draft-file");
const draftFileArgument =
  draftFileIndex >= 0 ? args[draftFileIndex + 1] : undefined;
const draftFile = draftFileArgument
  ? path.resolve(draftFileArgument)
  : undefined;

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  npm run content:factory -- packet --surah 108 [--ayah-start 1 --ayah-end 3] [--worker worker-1]",
      "  npm run content:factory -- draft --surah 108 [--ayah-start 1 --ayah-end 3] [--worker worker-1]",
      "  npm run content:factory -- register-draft --surah 108 --ayah-start 1 --ayah-end 3 --draft-file content-authoring/drafts/108/packet-108-1-3-revision-001.json --worker worker-1",
      "  npm run content:factory -- review --surah 108 --role morphology [--reviewer reviewer-1] [--ayah 1] [--ayah-start 1 --ayah-end 3]",
      "  npm run content:factory -- assemble --surah 108",
      "  npm run content:factory -- pilot --surah 108",
      "  npm run content:factory -- status --surah 108",
    ].join("\n"),
  );
}

if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114)
  usage();

if (ayahStartIndex >= 0 !== ayahEndIndex >= 0) usage();
if (
  (ayahStartIndex >= 0 &&
    (!Number.isInteger(requestedAyahStart) || (requestedAyahStart ?? 0) < 1)) ||
  (ayahEndIndex >= 0 &&
    (!Number.isInteger(requestedAyahEnd) || (requestedAyahEnd ?? 0) < 1)) ||
  (revisionIndex >= 0 && (!Number.isInteger(revision) || revision < 1)) ||
  (workerIndex >= 0 && (!workerId || workerId.startsWith("--"))) ||
  (reviewerIndex >= 0 &&
    (!reviewerIdentity || reviewerIdentity.startsWith("--"))) ||
  (reviewAyahIndex >= 0 &&
    (!Number.isInteger(reviewAyah) || (reviewAyah ?? 0) < 1))
)
  usage();
if (draftFileIndex >= 0 && !draftFile) usage();

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const output = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing !== output)
      throw new Error(`Refusing to overwrite immutable artifact ${filePath}`);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.writeFile(filePath, output, { encoding: "utf8", flag: "wx" });
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function listJsonFiles(directory: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function packageForSurah(number: number) {
  const paths = await discoverPackagePaths();
  for (const filePath of paths) {
    const result = await readPackage(filePath);
    if (result.package?.surah.number === number) return result;
  }
  throw new Error(`No valid source package found for Sūrah ${number}`);
}

function packetPath(packet: SourcePacket) {
  return path.join(
    sourceRoot,
    String(packet.surahNumber).padStart(3, "0"),
    `${packet.packetId.replaceAll(":", "-")}.json`,
  );
}

function draftPath(packet: SourcePacket, draftRevision: number) {
  return path.join(
    draftRoot,
    String(packet.surahNumber).padStart(3, "0"),
    `${packet.packetId.replaceAll(":", "-")}-revision-${String(draftRevision).padStart(3, "0")}.json`,
  );
}

function reviewPath(
  packet: SourcePacket,
  draftRevision: number,
  role: string,
  reviewer?: string,
) {
  const reviewerSuffix = reviewer
    ? `-${reviewer.replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : "";
  return path.join(
    reviewRoot,
    String(packet.surahNumber).padStart(3, "0"),
    `${packet.packetId.replaceAll(":", "-")}-revision-${String(draftRevision).padStart(3, "0")}-${role}${reviewerSuffix}.json`,
  );
}

function issuePath(
  packet: SourcePacket,
  draftRevision: number,
  role: string,
  reviewer?: string,
) {
  const reviewerSuffix = reviewer
    ? `-${reviewer.replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : "";
  return path.join(
    reviewRoot,
    String(packet.surahNumber).padStart(3, "0"),
    `${packet.packetId.replaceAll(":", "-")}-revision-${String(draftRevision).padStart(3, "0")}-${role}${reviewerSuffix}-issues.json`,
  );
}

function assembledPath(number: number) {
  return path.join(
    assembledRoot,
    String(number).padStart(3, "0"),
    "surah.json",
  );
}

async function loadOrCreatePacket(
  number: number,
  rangeStart?: number,
  rangeEnd?: number,
) {
  const result = await packageForSurah(number);
  if (!result.package) throw new Error(result.errors.join("\n"));
  const packet = buildSourcePacket(
    result.package,
    await readKnowledgeSnapshot(),
    rangeStart,
    rangeEnd,
  );
  await writeJson(packetPath(packet), packet);
  return packet;
}

function makeDraft(
  packet: SourcePacket,
  draftRevision: number,
  createdBy: string,
): ContentDraft {
  return {
    schemaVersion: "1.0.0",
    draftId: `draft:${packet.packetId}:revision:${draftRevision}`,
    packetId: packet.packetId,
    sourceFingerprint: packet.sourceFingerprint,
    knowledgeSnapshot: packet.knowledgeSnapshot,
    revision: draftRevision,
    status: "draft",
    createdBy,
    ayahs: packet.ayahs.map((ayah) => ({
      ayahId: ayah.id,
      ayahLayers: {},
      words: ayah.words.map((word) => ({
        wordId: word.id,
        layers: { breakdownScope: "shared" as const },
        layerState: layerStateForSourceOnly(),
      })),
    })),
  };
}

async function registerWorkUnit(
  packet: SourcePacket,
  status: string,
  paths: { packetPath?: string; draftPath?: string; assembledPath?: string },
  draftRevision = 1,
  assignedWorker = workerId,
) {
  const workUnitId = `work:${packet.packetId}`;
  const revisionId = `${workUnitId}:revision:${draftRevision}`;
  const existing = await pool.query<{
    assigned_worker: string | null;
    source_fingerprint: string;
    packet_path: string | null;
  }>(
    `select assigned_worker, source_fingerprint, packet_path
       from content_work_units where packet_id=$1`,
    [packet.packetId],
  );
  const existingUnit = existing.rows[0];
  if (existingUnit) {
    if (existingUnit.source_fingerprint !== packet.sourceFingerprint)
      throw new Error(
        `${packet.packetId}: source fingerprint changed; create a new packet revision`,
      );
    if (
      existingUnit.packet_path &&
      paths.packetPath &&
      existingUnit.packet_path !== paths.packetPath
    )
      throw new Error(`${packet.packetId}: packet artifact ownership conflict`);
    if (
      existingUnit.assigned_worker &&
      assignedWorker !== "content-factory" &&
      existingUnit.assigned_worker !== assignedWorker
    )
      throw new Error(
        `${packet.packetId}: already claimed by ${existingUnit.assigned_worker}`,
      );
  }
  const existingRevision = await pool.query<{
    source_fingerprint: string;
    draft_path: string | null;
    created_by: string | null;
  }>(
    `select source_fingerprint, draft_path, created_by
       from content_work_revisions where id=$1`,
    [revisionId],
  );
  const existingRevisionRow = existingRevision.rows[0];
  if (existingRevisionRow) {
    if (existingRevisionRow.source_fingerprint !== packet.sourceFingerprint)
      throw new Error(`${revisionId}: source fingerprint changed`);
    if (
      existingRevisionRow.draft_path &&
      paths.draftPath &&
      existingRevisionRow.draft_path !== paths.draftPath
    )
      throw new Error(`${revisionId}: draft artifact ownership conflict`);
    if (
      existingRevisionRow.created_by &&
      assignedWorker !== "content-factory" &&
      existingRevisionRow.created_by !== assignedWorker
    )
      throw new Error(
        `${revisionId}: revision already belongs to another worker`,
      );
  }
  await pool.query(
    `insert into content_work_units
      (id,packet_id,scope_type,surah_number,ayah_start,ayah_end,source_fingerprint,status,current_revision,assigned_worker,packet_path,approved_artifact_path,updated_at)
     values ($1,$2,'ayah-range',$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
     on conflict (packet_id) do update set
       source_fingerprint=excluded.source_fingerprint,
       status=case when excluded.current_revision >= content_work_units.current_revision
         then excluded.status else content_work_units.status end,
       current_revision=greatest(content_work_units.current_revision,excluded.current_revision),
       assigned_worker=coalesce(content_work_units.assigned_worker,excluded.assigned_worker),
       packet_path=coalesce(excluded.packet_path,content_work_units.packet_path),
       approved_artifact_path=coalesce(excluded.approved_artifact_path,content_work_units.approved_artifact_path),
       updated_at=now()`,
    [
      workUnitId,
      packet.packetId,
      packet.surahNumber,
      packet.ayahStart,
      packet.ayahEnd,
      packet.sourceFingerprint,
      status,
      draftRevision,
      assignedWorker,
      paths.packetPath ?? null,
      paths.assembledPath ?? null,
    ],
  );
  await pool.query(
    `insert into content_work_revisions
      (id,work_unit_id,revision,source_fingerprint,status,draft_path,assembled_path,layer_state,created_by,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     on conflict (id) do update set
       status=excluded.status,
       draft_path=coalesce(excluded.draft_path,content_work_revisions.draft_path),
       assembled_path=coalesce(excluded.assembled_path,content_work_revisions.assembled_path),
       layer_state=excluded.layer_state,
       updated_at=now()`,
    [
      revisionId,
      workUnitId,
      draftRevision,
      packet.sourceFingerprint,
      status,
      paths.draftPath ?? null,
      paths.assembledPath ?? null,
      JSON.stringify({ status, source: "content-factory" }),
      assignedWorker,
    ],
  );
  return { workUnitId, revisionId };
}

async function createPacket(
  number: number,
  rangeStart?: number,
  rangeEnd?: number,
) {
  const packet = await loadOrCreatePacket(number, rangeStart, rangeEnd);
  const output = packetPath(packet);
  await registerWorkUnit(packet, "source-imported", { packetPath: output });
  console.log(`SOURCE PACKET ${output}`);
  return packet;
}

async function createDraft(
  number: number,
  rangeStart?: number,
  rangeEnd?: number,
) {
  const packet = await createPacket(number, rangeStart, rangeEnd);
  const draft = makeDraft(packet, revision, workerId);
  const parsed = ContentDraftSchema.safeParse(draft);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join("\n"),
    );
  const output = draftPath(packet, revision);
  await writeJson(output, draft);
  await registerWorkUnit(
    packet,
    "review-required",
    {
      packetPath: packetPath(packet),
      draftPath: output,
    },
    revision,
  );
  console.log(`STRUCTURED DRAFT ${output}`);
  return { packet, draft, output };
}

async function registerDraft(
  number: number,
  rangeStart?: number,
  rangeEnd?: number,
) {
  if (!draftFile) usage();
  const packet = await loadOrCreatePacket(number, rangeStart, rangeEnd);
  const expectedPath = path.resolve(draftPath(packet, revision));
  if (path.resolve(draftFile) !== expectedPath)
    throw new Error(
      `Draft artifact must use the immutable packet path ${expectedPath}`,
    );
  const parsed = ContentDraftSchema.safeParse(await readJson(draftFile));
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join("\n"),
    );
  if (
    parsed.data.packetId !== packet.packetId ||
    parsed.data.revision !== revision
  )
    throw new Error(
      "Draft packet or revision does not match the requested registration",
    );
  const errors = validateDraftAgainstPacket(packet, parsed.data);
  if (errors.length) throw new Error(errors.join("\n"));
  await registerWorkUnit(
    packet,
    "review-required",
    { packetPath: packetPath(packet), draftPath: draftFile },
    revision,
    workerId,
  );
  console.log(`REGISTERED IMMUTABLE DRAFT ${draftFile}`);
  return parsed.data;
}

async function createReview(number: number, role: string) {
  const packet = await loadOrCreatePacket(
    number,
    requestedAyahStart,
    requestedAyahEnd,
  );
  const draftFile = draftPath(packet, revision);
  const draft = await readJson<ContentDraft>(draftFile);
  const draftResult = ContentDraftSchema.safeParse(draft);
  if (!draftResult.success)
    throw new Error(
      draftResult.error.issues.map((issue) => issue.message).join("\n"),
    );
  const scopedAyahs = reviewAyah
    ? packet.ayahs.filter((ayah) => ayah.number === reviewAyah)
    : packet.ayahs;
  if (!scopedAyahs.length)
    throw new Error(`Review āyah ${reviewAyah} is not in this packet`);
  const reviewScope = ReviewScopeSchema.parse({
    type: reviewAyah ? "ayah" : "packet",
    ayahIds: scopedAyahs.map((ayah) => ayah.id),
  });
  const scopeId = reviewAyah ? scopedAyahs[0].id : packet.packetId;
  const issues: ContentIssue[] = validateDraftAgainstPacket(packet, draft).map(
    (message, index) =>
      ContentIssueSchema.parse({
        id: `issue:${packet.packetId}:revision:${revision}:structural:${index + 1}`,
        code: "STRUCTURAL_VALIDATION_FAILED",
        severity: "blocker",
        scopeId,
        path: "draft",
        message,
        requiredAction: "Repair the draft before review can continue.",
        evidence: {},
      }),
  );
  if (!issues.length && role !== "source" && !draftHasAuthoredContent(draft)) {
    issues.push(
      ContentIssueSchema.parse({
        id: `issue:${packet.packetId}:revision:${revision}:content-pending`,
        code: "CONTENT_DATA_NOT_AUTHORED",
        severity: "blocker",
        scopeId,
        path: "ayahs[].words[].layers",
        message:
          "The systems pilot contains a source-backed draft but no reviewed custom content.",
        requiredAction:
          "A content worker must author the requested layer before this review can approve it.",
        evidence: { pilot: true, sourceOnly: true },
      }),
    );
  }
  const output = reviewPath(packet, revision, role, reviewerIdentity);
  let reviewedAt = new Date().toISOString();
  try {
    const existing = await readJson<ReviewArtifact>(output);
    if (
      existing.reviewId ===
        `review:${packet.packetId}:revision:${revision}:${role}${reviewerIdentity ? `:${reviewerIdentity}` : ""}` &&
      existing.draftId === draft.draftId
    )
      reviewedAt = existing.reviewedAt;
  } catch {
    /* this is a new immutable review artifact */
  }
  const review: ReviewArtifact = {
    schemaVersion: "1.0.0",
    reviewId: `review:${packet.packetId}:revision:${revision}:${role}${reviewerIdentity ? `:${reviewerIdentity}` : ""}`,
    packetId: packet.packetId,
    draftId: draft.draftId,
    revision,
    scope: reviewScope,
    reviewerRole: role as ReviewArtifact["reviewerRole"],
    reviewerId: reviewerIdentity ?? `pilot-${role}-reviewer`,
    independent: role !== "source",
    status: issues.length ? "revision-required" : "approved",
    issues,
    reviewedAt,
  };
  const reviewResult = ReviewArtifactSchema.safeParse(review);
  if (!reviewResult.success)
    throw new Error(
      reviewResult.error.issues.map((issue) => issue.message).join("\n"),
    );
  await writeJson(output, review);
  const manifest: IssueManifest = {
    schemaVersion: "1.0.0",
    manifestId: `issues:${packet.packetId}:revision:${revision}:${scopeId}:${role}${reviewerIdentity ? `:${reviewerIdentity}` : ""}`,
    packetId: packet.packetId,
    draftId: draft.draftId,
    revision,
    scope: reviewScope,
    status: issues.length ? "open" : "resolved",
    issues,
  };
  const manifestResult = IssueManifestSchema.safeParse(manifest);
  if (!manifestResult.success)
    throw new Error(
      manifestResult.error.issues.map((issue) => issue.message).join("\n"),
    );
  const manifestFile = issuePath(packet, revision, role, reviewerIdentity);
  await writeJson(manifestFile, manifest);
  const { revisionId } = await registerWorkUnit(
    packet,
    issues.length ? "repair-required" : "review-required",
    { packetPath: packetPath(packet), draftPath: draftFile },
    revision,
  );
  await pool.query(
    `insert into content_work_reviews
      (id,revision_id,scope_id,reviewer_role,reviewer_id,independent,status,artifact_path,issue_count,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     on conflict (id) do update set
       status=excluded.status,
       scope_id=excluded.scope_id,
       artifact_path=excluded.artifact_path,
       issue_count=excluded.issue_count,
       updated_at=now()`,
    [
      review.reviewId,
      revisionId,
      scopeId,
      review.reviewerRole,
      review.reviewerId,
      review.independent,
      review.status,
      output,
      issues.length,
    ],
  );
  for (const issue of issues) {
    await pool.query(
      `insert into content_work_issues
        (id,revision_id,issue_code,severity,scope_id,message,status,detail,updated_at)
       values ($1,$2,$3,$4,$5,$6,'open',$7,now())
       on conflict (id) do update set status='open', message=excluded.message, detail=excluded.detail, updated_at=now()`,
      [
        issue.id,
        revisionId,
        issue.code,
        issue.severity,
        issue.scopeId,
        issue.message,
        JSON.stringify({
          path: issue.path,
          requiredAction: issue.requiredAction,
        }),
      ],
    );
  }
  console.log(`REVIEW ${review.status.toUpperCase()} ${output}`);
  console.log(`ISSUES ${manifestFile}`);
  return { packet, review, manifest };
}

async function assemble(number: number) {
  const result = await packageForSurah(number);
  if (!result.package) throw new Error(result.errors.join("\n"));
  const currentKnowledge = await readKnowledgeSnapshot();
  const surahDirectory = String(number).padStart(3, "0");
  const packetFiles = await listJsonFiles(
    path.join(sourceRoot, surahDirectory),
  );
  const draftFiles = await listJsonFiles(path.join(draftRoot, surahDirectory));
  const reviewFiles = await listJsonFiles(
    path.join(reviewRoot, surahDirectory),
  );
  const packets = [];
  for (const file of packetFiles) {
    const parsed = SourcePacketSchema.safeParse(await readJson(file));
    if (!parsed.success)
      throw new Error(
        `${file}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
      );
    packets.push(parsed.data);
  }
  const drafts = [];
  for (const file of draftFiles) {
    const parsed = ContentDraftSchema.safeParse(await readJson(file));
    if (!parsed.success)
      throw new Error(
        `${file}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
      );
    drafts.push(parsed.data);
  }
  const reviews: ReviewArtifact[] = [];
  const manifests: IssueManifest[] = [];
  for (const file of reviewFiles) {
    const raw = await readJson<unknown>(file);
    const review = ReviewArtifactSchema.safeParse(raw);
    if (review.success) {
      reviews.push(review.data);
      continue;
    }
    const manifest = IssueManifestSchema.safeParse(raw);
    if (manifest.success) {
      manifests.push(manifest.data);
      continue;
    }
    throw new Error(`${file}: not a valid review or issue manifest`);
  }
  if (!packets.length)
    throw new Error(`No source packets found for Sūrah ${number}`);
  if (!drafts.length)
    throw new Error(`No draft artifacts found for Sūrah ${number}`);
  const assembledPackage = assembleAuthoredSurah({
    sourcePackage: result.package,
    packets,
    drafts,
    reviews,
    manifests,
    knowledgeSnapshot: currentKnowledge,
  });
  const output = assembledPath(number);
  const candidate = `${output}.candidate`;
  await fs.mkdir(path.dirname(candidate), { recursive: true });
  await fs.writeFile(
    candidate,
    `${JSON.stringify(assembledPackage, null, 2)}\n`,
    "utf8",
  );
  const assembledCandidate = await readPackage(candidate);
  if (!assembledCandidate.package || assembledCandidate.errors.length) {
    await fs.rm(candidate, { force: true });
    throw new Error(
      `Assembled package failed validation:\n${assembledCandidate.errors.join("\n")}`,
    );
  }
  await fs.rename(candidate, output);
  const assembled = await readPackage(output);
  if (!assembled.package || assembled.errors.length)
    throw new Error(
      `Assembled package failed validation:\n${assembled.errors.join("\n")}`,
    );
  for (const packet of packets) {
    const packetDrafts = drafts.filter(
      (draft) => draft.packetId === packet.packetId,
    );
    const selectedRevision = Math.max(
      ...packetDrafts.map((draft) => draft.revision),
    );
    await registerWorkUnit(
      packet,
      "assembled",
      { packetPath: packetPath(packet), assembledPath: output },
      selectedRevision,
    );
    await pool.query(
      `update content_work_issues
          set status='resolved', updated_at=now()
        where revision_id=$1 and status='open'`,
      [`work:${packet.packetId}:revision:${selectedRevision}`],
    );
  }
  console.log(`ASSEMBLED CANONICAL PACKAGE ${output}`);
  return output;
}

async function status(number: number) {
  const result = await pool.query(
    `select wu.packet_id, wu.status, wu.current_revision, wu.packet_path,
            wu.approved_artifact_path, wr.status as revision_status,
            count(distinct rv.id)::int as review_count,
            count(distinct wi.id)::int as issue_count
     from content_work_units wu
     left join content_work_revisions wr
       on wr.work_unit_id=wu.id and wr.revision=wu.current_revision
     left join content_work_reviews rv on rv.revision_id=wr.id
     left join content_work_issues wi on wi.revision_id=wr.id and wi.status='open'
     where wu.surah_number=$1
     group by wu.packet_id, wu.status, wu.current_revision,
              wu.packet_path, wu.approved_artifact_path, wr.status
     order by wu.packet_id`,
    [number],
  );
  console.table(result.rows);
}

try {
  if (command === "packet")
    await createPacket(surahNumber, requestedAyahStart, requestedAyahEnd);
  else if (command === "draft")
    await createDraft(surahNumber, requestedAyahStart, requestedAyahEnd);
  else if (command === "register-draft")
    await registerDraft(surahNumber, requestedAyahStart, requestedAyahEnd);
  else if (command === "review") await createReview(surahNumber, reviewerRole);
  else if (command === "assemble") await assemble(surahNumber);
  else if (command === "status") await status(surahNumber);
  else if (command === "pilot") {
    await createDraft(surahNumber, requestedAyahStart, requestedAyahEnd);
    await createReview(surahNumber, "source");
    const assembled = await assemble(surahNumber);
    const report = {
      pilot: "systems-only",
      surah: surahNumber,
      sourceOnly: true,
      customContentImported: false,
      commands: [
        `npm run content:factory -- packet --surah ${surahNumber}`,
        `npm run content:factory -- draft --surah ${surahNumber}`,
        `npm run content:factory -- review --surah ${surahNumber} --role source`,
        `npm run content:factory -- assemble --surah ${surahNumber}`,
        `npm run content:import -- --package content-authoring/assembled/${String(surahNumber).padStart(3, "0")}/surah.json --dry-run`,
      ],
      assembledPath: assembled,
      nextState: "awaiting-authored-content",
    };
    await writeJson(
      path.join(pilotRoot, String(surahNumber).padStart(3, "0"), "report.json"),
      report,
    );
    console.log(JSON.stringify(report, null, 2));
  } else usage();
} finally {
  await pool.end();
}
