import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const contentPackages = pgTable(
  "content_packages",
  {
    id: text("id").primaryKey(),
    schemaVersion: text("schema_version").notNull(),
    contentVersion: text("content_version").notNull(),
    status: text("status").notNull(),
    sourcePath: text("source_path").notNull(),
    checksum: text("checksum").notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("content_packages_checksum_idx").on(table.checksum)],
);

export const contentImports = pgTable(
  "content_imports",
  {
    id: text("id").primaryKey(),
    packageId: text("package_id").notNull(),
    dryRun: boolean("dry_run").notNull().default(false),
    status: text("status").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("content_imports_package_idx").on(table.packageId)],
);

export const contentImportItems = pgTable("content_import_items", {
  id: text("id").primaryKey(),
  importId: text("import_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
});

export const sourceProviders = pgTable("source_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version"),
  attribution: text("attribution"),
  license: text("license"),
  ...timestamps,
});

export const sourceRecords = pgTable(
  "source_records",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    recordType: text("record_type").notNull(),
    recordKey: text("record_key").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    checksum: text("checksum"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_records_provider_key_idx").on(
      table.providerId,
      table.recordKey,
    ),
  ],
);

export const surahs = pgTable(
  "surahs",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    arabicName: text("arabic_name").notNull(),
    transliteration: text("transliteration").notNull(),
    englishLabel: text("english_label").notNull(),
    ayahCount: integer("ayah_count").notNull(),
    status: text("status").notNull(),
    description: text("description").notNull().default(""),
    sourceProviderId: text("source_provider_id"),
    ...timestamps,
  },
  (table) => [uniqueIndex("surahs_number_idx").on(table.number)],
);

export const ayahs = pgTable(
  "ayahs",
  {
    id: text("id").primaryKey(),
    surahId: text("surah_id").notNull(),
    number: integer("number").notNull(),
    arabic: text("arabic").notNull(),
    translation: text("translation"),
    naturalMeaning: text("natural_meaning"),
    status: text("status").notNull(),
    sourceProviderId: text("source_provider_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ayahs_surah_number_idx").on(table.surahId, table.number),
  ],
);

export const quranTextVariants = pgTable("quran_text_variants", {
  id: text("id").primaryKey(),
  ayahId: text("ayah_id").notNull(),
  providerId: text("provider_id").notNull(),
  text: text("text").notNull(),
  version: text("version").notNull(),
  attribution: text("attribution").notNull(),
  checksum: text("checksum").notNull(),
  ...timestamps,
});

export const roots = pgTable("roots", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  transliteration: text("transliteration"),
  sourceEvidence: jsonb("source_evidence").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const lemmas = pgTable("lemmas", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  transliteration: text("transliteration"),
  sourceEvidence: jsonb("source_evidence").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const wordOccurrences = pgTable(
  "word_occurrences",
  {
    id: text("id").primaryKey(),
    surahId: text("surah_id").notNull(),
    ayahId: text("ayah_id").notNull(),
    position: integer("position").notNull(),
    arabic: text("arabic").notNull(),
    transliteration: text("transliteration"),
    gloss: text("gloss"),
    status: text("status").notNull(),
    sharedTeachingId: text("shared_teaching_id"),
    occurrenceRole: text("occurrence_role"),
    rootId: text("root_id"),
    lemmaId: text("lemma_id"),
    sourceRefs: jsonb("source_refs").$type<Record<string, unknown>[]>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("word_occurrences_ayah_position_idx").on(
      table.ayahId,
      table.position,
    ),
    index("word_occurrences_arabic_idx").on(table.arabic),
  ],
);

export const translations = pgTable("translations", {
  id: text("id").primaryKey(),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  language: text("language").notNull(),
  text: text("text").notNull(),
  author: text("author"),
  provider: text("provider"),
  license: text("license"),
  version: text("version"),
  ...timestamps,
});

export const transliterations = pgTable("transliterations", {
  id: text("id").primaryKey(),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  text: text("text").notNull(),
  provider: text("provider"),
  version: text("version"),
  ...timestamps,
});

export const audioReferences = pgTable("audio_references", {
  id: text("id").primaryKey(),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  provider: text("provider").notNull(),
  url: text("url").notNull(),
  reciter: text("reciter"),
  available: boolean("available").notNull().default(true),
  ...timestamps,
});

export const morphologyRecords = pgTable("morphology_records", {
  id: text("id").primaryKey(),
  occurrenceId: text("occurrence_id").notNull(),
  provider: text("provider").notNull(),
  rootId: text("root_id"),
  lemmaId: text("lemma_id"),
  partOfSpeech: text("part_of_speech"),
  features: jsonb("features").$type<Record<string, unknown>>(),
  segmentation: jsonb("segmentation").$type<Record<string, unknown>[]>(),
  syntax: jsonb("syntax").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const teachingWordEntries = pgTable(
  "teaching_word_entries",
  {
    id: text("id").primaryKey(),
    packageId: text("package_id").notNull(),
    meaning: text("meaning").notNull(),
    type: text("type").notNull(),
    root: text("root").notNull().default(""),
    rootPicture: text("root_picture").notNull().default(""),
    construction: text("construction").notNull(),
    components: jsonb("components")
      .$type<Record<string, unknown>[]>()
      .notNull(),
    grammar: text("grammar").notNull(),
    sentenceRole: text("sentence_role").notNull(),
    recognitionClue: text("recognition_clue").notNull(),
    forms: jsonb("forms").$type<Record<string, unknown>[]>().notNull(),
    takeaway: text("takeaway").notNull(),
    ...timestamps,
  },
  (table) => [index("teaching_word_entries_package_idx").on(table.packageId)],
);

export const rootPictureTerms = pgTable("root_picture_terms", {
  id: text("id").primaryKey(),
  rootId: text("root_id").notNull(),
  text: text("text").notNull(),
  source: text("source").notNull().default("project-authored"),
  ...timestamps,
});

export const recognitionClues = pgTable("recognition_clues", {
  id: text("id").primaryKey(),
  teachingEntryId: text("teaching_entry_id").notNull(),
  text: text("text").notNull(),
  ...timestamps,
});

export const formFamilies = pgTable("form_families", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull(),
  name: text("name").notNull(),
  ...timestamps,
});

export const formFamilyEntries = pgTable("form_family_entries", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull(),
  form: text("form").notNull(),
  meaning: text("meaning").notNull(),
  difference: text("difference").notNull(),
  ...timestamps,
});

export const ayahTeachingEntries = pgTable("ayah_teaching_entries", {
  id: text("id").primaryKey(),
  ayahId: text("ayah_id").notNull(),
  summary: text("summary"),
  sentenceMap: jsonb("sentence_map").$type<Record<string, unknown>[]>(),
  ...timestamps,
});

export const sentenceMapNodes = pgTable("sentence_map_nodes", {
  id: text("id").primaryKey(),
  ayahTeachingId: text("ayah_teaching_id").notNull(),
  order: integer("order").notNull(),
  text: text("text").notNull(),
  explanation: text("explanation").notNull(),
});

export const drills = pgTable("drills", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull(),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  explanation: text("explanation"),
  ...timestamps,
});

export const drillOptions = pgTable("drill_options", {
  id: text("id").primaryKey(),
  drillId: text("drill_id").notNull(),
  text: text("text").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
});

export const wordBreakdowns = pgTable(
  "word_breakdowns",
  {
    id: text("id").primaryKey(),
    packageId: text("package_id").notNull(),
    mode: text("mode").notNull(),
    sourceText: text("source_text").notNull(),
    teachingEntryId: text("teaching_entry_id"),
    wordOccurrenceId: text("word_occurrence_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("word_breakdowns_shared_idx").on(table.teachingEntryId),
    uniqueIndex("word_breakdowns_override_idx").on(table.wordOccurrenceId),
  ],
);

export const wordBreakdownParts = pgTable(
  "word_breakdown_parts",
  {
    id: text("id").primaryKey(),
    breakdownId: text("breakdown_id").notNull(),
    stablePartId: text("stable_part_id").notNull(),
    partOrder: integer("part_order").notNull(),
    sourceText: text("source_text").notNull(),
    displayText: text("display_text").notNull(),
    label: text("label").notNull(),
    meaning: text("meaning").notNull(),
    kind: text("kind").notNull(),
  },
  (table) => [
    uniqueIndex("word_breakdown_parts_stable_idx").on(
      table.breakdownId,
      table.stablePartId,
    ),
    uniqueIndex("word_breakdown_parts_order_idx").on(
      table.breakdownId,
      table.partOrder,
    ),
  ],
);

export const volumes = pgTable("volumes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const volumeSurahs = pgTable(
  "volume_surahs",
  {
    volumeId: text("volume_id").notNull(),
    surahId: text("surah_id").notNull(),
    order: integer("order").notNull(),
  },
  (table) => [primaryKey({ columns: [table.volumeId, table.surahId] })],
);

export const generatedDocuments = pgTable("generated_documents", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
  printOptions: jsonb("print_options")
    .$type<Record<string, unknown>>()
    .notNull(),
  contentFingerprint: text("content_fingerprint").notNull(),
  status: text("status").notNull(),
  outputPath: text("output_path"),
  pageCount: integer("page_count"),
  error: text("error"),
  ...timestamps,
});
