export type SarfForm = {
  form: string;
  meaning: string;
  difference: string;
  relationship: string;
  provenance: string;
};

export type SarfReview = {
  status: "full" | "limited";
  limitedReason?: string;
  auditDecision?:
    | "confirmed-limited"
    | "upgraded-to-full"
    | "blocked-for-genuine-ambiguity";
  provenance: string[];
  reviewedBy: string;
  reviewedAt: string;
};

export type SarfCandidate = SarfForm & {
  score?: number;
};

export type SarfFamilyInput = {
  currentForm: string;
  currentMeaning: string;
  currentDifference: string;
  root: string;
  type: string;
  candidates: SarfCandidate[];
  provenance: string[];
  reviewedAt: string;
  limitedReason?: string;
};

const ARABIC_PATTERN =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const PLACEHOLDER_PATTERN =
  /root[- ]letter|root skeleton|dictionary form connected|lemma \/ dictionary|case or pattern used|(?:nominative|accusative|genitive) ending(?: pattern)?|related verbal ending|recognition variant|related grammatical (?:word|form)|the form used in this occurrence|^lexical stem$|^additional root|^base grammatical form$/iu;

function normalize(value: string) {
  return value.normalize("NFC").replace(/[\u0640\s]/gu, "");
}

function base(value: string) {
  return normalize(value).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "");
}

const ARABIC_DIACRITIC_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/u;

function isBareRootRadicals(form: string, root: string) {
  return base(form) === base(root) && !ARABIC_DIACRITIC_PATTERN.test(form);
}

function isRootlessOrRestricted(type: string, root: string) {
  if (!root.trim()) return true;
  const normalizedType = type.toLocaleLowerCase();
  if (/proper\s*(?:name|noun)|fixed\s+grammatical/iu.test(normalizedType))
    return true;
  if (
    /\b(?:particle|preposition|pronoun|conjunction|connector|demonstrative|relative\s+(?:word|pronoun))\b/iu.test(
      normalizedType,
    ) &&
    !/\b(?:plus|and|with)\s+(?:noun|adjective|verb|stem|lexeme)\b/iu.test(
      normalizedType,
    )
  )
    return true;
  return false;
}

function usableCandidate(candidate: SarfCandidate, root: string) {
  if (!candidate.form.trim() || !ARABIC_PATTERN.test(candidate.form))
    return false;
  if (!candidate.meaning.trim() || !candidate.difference.trim()) return false;
  if (!candidate.relationship.trim() || !candidate.provenance.trim())
    return false;
  if (
    PLACEHOLDER_PATTERN.test(
      `${candidate.meaning} ${candidate.difference} ${candidate.relationship}`,
    )
  )
    return false;
  if (root.trim() && isBareRootRadicals(candidate.form, root)) return false;
  return true;
}

export function reviewSarfFamily(input: SarfFamilyInput) {
  const current: SarfForm = {
    form: input.currentForm,
    meaning: input.currentMeaning,
    difference: input.currentDifference,
    relationship: input.root
      ? `Current Qur'anic occurrence of the ${input.root} root/lexeme.`
      : "Current Qur'anic occurrence of this grammatical item.",
    provenance:
      input.provenance[0] ??
      "Codex review of the canonical Qur'anic occurrence and aligned linguistic evidence.",
  };
  const seen = new Set([normalize(current.form)]);
  const forms: SarfForm[] = [current];
  // A grammatical label on the outside of a compound must not hide a lexical
  // stem.  In particular, "preposition plus noun" is a lexical noun lesson,
  // not a rootless preposition lesson.
  const restricted = isRootlessOrRestricted(input.type, input.root);
  const target = restricted ? 4 : 5;
  const candidates = input.candidates
    .filter((candidate) => usableCandidate(candidate, input.root))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  for (const candidate of candidates) {
    const key = normalize(candidate.form);
    if (seen.has(key)) continue;
    seen.add(key);
    forms.push({
      form: candidate.form,
      meaning: candidate.meaning,
      difference: candidate.difference,
      relationship: candidate.relationship,
      provenance: candidate.provenance,
    });
    if (forms.length === target) break;
  }

  const full = !restricted && forms.length === 5;
  const review: SarfReview = {
    status: full ? "full" : "limited",
    ...(full
      ? {}
      : {
          limitedReason:
            input.limitedReason ??
            (restricted
              ? "This reviewed item is rootless or a fixed/proper grammatical lexeme; the remaining possible variants are grammatical or inflectional rather than useful lexical Ṣarf forms."
              : `This rootful family has only ${forms.length} reviewed forms in the current evidence. It is blocked for genuine linguistic review rather than being treated as a valid limited family, because adding rows without reliable evidence would be fabrication or weak padding.`),
          auditDecision: restricted
            ? "confirmed-limited"
            : "blocked-for-genuine-ambiguity",
        }),
    provenance: input.provenance,
    reviewedBy: "Codex",
    reviewedAt: input.reviewedAt,
  };
  return { forms, review };
}

export function featureDifference(
  features: Array<{ label?: string; value?: string }>,
  fallback: string,
) {
  const useful = features
    .map((feature) =>
      `${feature.label ?? "feature"}: ${feature.value ?? ""}`.trim(),
    )
    .filter((feature) => feature !== "feature:");
  return useful.length ? useful.join("; ") : fallback;
}

export function normalizeSarfForm(value: string) {
  return normalize(value);
}
