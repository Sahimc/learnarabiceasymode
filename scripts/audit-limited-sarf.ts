import { discoverPackagePaths, readPackage } from "./lib/packages";
import { pool } from "./lib/db";
import { assertAuthoringContract } from "./lib/authoring-contract";

assertAuthoringContract("limited Ṣarf population audit");

type Feature = { key?: string; label?: string; value?: string };
type ProviderRow = {
  occurrence_id: string;
  part_of_speech: string | null;
  features: unknown;
};
type ProfileItem = {
  surah: number;
  ayah: number;
  position: number;
  occurrenceId: string;
  teachingId: string;
  word: string;
  meaning: string;
  root: string;
  type: string;
  providerPartOfSpeech: string;
  forms: number;
  reason: string;
  category: string;
  familyRootOccurrences: number;
  familyRootForms: number;
  familyRootFullForms: number;
};

function parseFeatures(value: unknown): Feature[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as { features?: unknown };
    return Array.isArray(parsed.features)
      ? parsed.features.filter(
          (item): item is Feature =>
            typeof item === "object" && item !== null,
        )
      : [];
  } catch {
    return [];
  }
}

function rootKey(value: string) {
  return value.replace(/\s+/gu, "").trim();
}

function classify(
  root: string,
  type: string,
  providerPartOfSpeech: string,
  components: Array<{ rootStatus?: string; kind?: string; rootExplanation?: string }>,
) {
  const text = `${type} ${providerPartOfSpeech} ${components.map((item) => `${item.kind ?? ""} ${item.rootExplanation ?? ""}`).join(" ")}`.toLowerCase();
  if (!root.trim()) {
    if (/preposition/.test(text)) return "preposition";
    if (/pronoun/.test(text)) return "pronoun";
    if (/conjunction|connector/.test(text)) return "connector/conjunction";
    if (/particle/.test(text)) return "particle";
    if (/demonstrative/.test(text)) return "demonstrative";
    if (/relative/.test(text)) return "relative word";
    if (/vocative/.test(text)) return "vocative";
    if (/article/.test(text)) return "article";
    if (/adverb/.test(text)) return "adverb";
    return "rootless grammatical/other";
  }
  if (/proper\s*(name|noun)/.test(text)) return "proper noun";
  if (/verb/.test(text)) return "verb";
  if (/noun\s*\/\s*adjective/.test(text)) return "noun/adjective";
  if (/adjective/.test(text)) return "adjective";
  if (/noun/.test(text)) return "noun";
  if (/participle/.test(text)) return "participle";
  return "lexical other";
}

function reasonKind(reason: string) {
  if (/particle|fixed grammatical|proper noun|restricted family/.test(reason))
    return "restricted/generic";
  if (/only \d+ additional/.test(reason)) return "candidate-count/generic";
  if (/missing|uncertain|conflict|ambig/i.test(reason)) return "uncertainty";
  return "specific/other";
}

const paths = await discoverPackagePaths();
const profiles: ProfileItem[] = [];
const rootAll = new Map<string, { occurrences: number; forms: Set<string>; fullForms: Set<string> }>();
const packages = [] as Array<{ path: string; package: NonNullable<Awaited<ReturnType<typeof readPackage>>["package"]> }>;

for (const file of paths) {
  const result = await readPackage(file);
  if (!result.package) continue;
  packages.push({ path: file, package: result.package });
  for (const ayah of result.package.ayahs) {
    for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = result.package.teachingEntries[word.teachingId];
      if (!lesson) continue;
      const key = rootKey(lesson.root);
      if (!key) continue;
      const family = rootAll.get(key) ?? {
        occurrences: 0,
        forms: new Set<string>(),
        fullForms: new Set<string>(),
      };
      family.occurrences += 1;
      family.forms.add(word.arabic.normalize("NFC").replace(/[\u0640\s]/gu, ""));
      if (lesson.sarfReview.status === "full")
        for (const form of lesson.forms)
          family.fullForms.add(form.form.normalize("NFC").replace(/[\u0640\s]/gu, ""));
      rootAll.set(key, family);
    }
  }
}

const limitedOccurrenceIds = packages.flatMap(({ package: pkg }) =>
  pkg.ayahs.flatMap((ayah) =>
    ayah.words.flatMap((word) => {
      const lesson = word.teachingId ? pkg.teachingEntries[word.teachingId] : undefined;
      return lesson?.sarfReview.status === "limited" ? [word.id] : [];
    }),
  ),
);
const providerResult = await pool.query<ProviderRow>(
  `select distinct on (occurrence_id) occurrence_id, part_of_speech, features
   from morphology_records
   where provider='quranic-arabic-corpus' and occurrence_id = any($1::text[])
   order by occurrence_id, id`,
  [limitedOccurrenceIds],
);
const provider = new Map(providerResult.rows.map((row) => [row.occurrence_id, row]));

for (const { package: pkg } of packages) {
  for (const ayah of pkg.ayahs) {
    for (const word of ayah.words) {
      if (!word.teachingId) continue;
      const lesson = pkg.teachingEntries[word.teachingId];
      if (!lesson || lesson.sarfReview.status !== "limited") continue;
      const row = provider.get(word.id);
      const features = parseFeatures(row?.features);
      const type = lesson.type ?? "";
      const key = rootKey(lesson.root);
      const family = rootAll.get(key);
      profiles.push({
        surah: pkg.surah.number,
        ayah: ayah.number,
        position: word.position,
        occurrenceId: word.id,
        teachingId: word.teachingId,
        word: word.arabic,
        meaning: word.gloss ?? lesson.meaning,
        root: lesson.root,
        type,
        providerPartOfSpeech:
          row?.part_of_speech ??
          features.find((feature) => (feature.key ?? feature.label ?? "").toLowerCase() === "partofspeech")?.value ??
          "",
        forms: lesson.forms.length,
        reason: lesson.sarfReview.limitedReason ?? "missing reason",
        category: classify(lesson.root, type, row?.part_of_speech ?? "", lesson.components),
        familyRootOccurrences: family?.occurrences ?? 0,
        familyRootForms: family?.forms.size ?? 0,
        familyRootFullForms: family?.fullForms.size ?? 0,
      });
    }
  }
}

const by = (values: string[]) =>
  Object.fromEntries(
    [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
      .sort((left, right) => right[1] - left[1])
      .map(([key, value]) => [key, value]),
  );

const lexical = profiles.filter((item) => item.root.trim());
const suspicious = lexical.filter(
  (item) =>
    ["verb", "adjective", "participle", "noun", "lexical other"].includes(item.category) &&
    (item.familyRootForms >= 5 || item.familyRootFullForms >= 5 || item.forms === 1),
);
const lexicalWithFullRootFamily = lexical.filter(
  (item) => item.familyRootFullForms >= 5,
);
const lexicalWithFiveObservedRootForms = lexical.filter(
  (item) => item.familyRootForms >= 5,
);
const rootGroups = new Map<string, ProfileItem[]>();
for (const item of lexical) {
  const key = rootKey(item.root);
  rootGroups.set(key, [...(rootGroups.get(key) ?? []), item]);
}
const rootGroupSummary = [...rootGroups.entries()]
  .map(([root, items]) => ({
    root,
    limited: items.length,
    categories: [...new Set(items.map((item) => item.category))],
    rootForms: items[0]?.familyRootForms ?? 0,
    fullForms: items[0]?.familyRootFullForms ?? 0,
    sample: items[0]?.word,
  }))
  .sort((left, right) => right.limited - left.limited || left.root.localeCompare(right.root));
const categoryReviewStats = Object.fromEntries(
  [...new Set(lexical.map((item) => item.category))].map((category) => {
    const items = lexical.filter((item) => item.category === category);
    return [
      category,
      {
        limited: items.length,
        withFullRootFamily: items.filter((item) => item.familyRootFullForms >= 5).length,
        withFiveObservedRootForms: items.filter((item) => item.familyRootForms >= 5).length,
        rootGroups: new Set(items.map((item) => rootKey(item.root))).size,
      },
    ];
  }),
);
const result = {
  packages: packages.length,
  limitedFamilies: profiles.length,
  byCategory: by(profiles.map((item) => item.category)),
  byReasonKind: by(profiles.map((item) => reasonKind(item.reason))),
  byForms: by(profiles.map((item) => String(item.forms))),
  bySurah: by(profiles.map((item) => String(item.surah))),
  rootless: profiles.filter((item) => !item.root.trim()).length,
  lexical: lexical.length,
  providerRows: provider.size,
  lexicalWithFullRootFamily: lexicalWithFullRootFamily.length,
  lexicalWithFiveObservedRootForms: lexicalWithFiveObservedRootForms.length,
  lexicalRootGroups: rootGroups.size,
  lexicalRootGroupsWithFullFamilies: rootGroupSummary.filter((item) => item.fullForms >= 5).length,
  rootGroupSummary: rootGroupSummary.slice(0, 1000),
  categoryReviewStats,
  suspiciousLexical: suspicious.length,
  samples: suspicious.slice(0, 30),
};
console.log(JSON.stringify(result, null, 2));
await pool.end();
