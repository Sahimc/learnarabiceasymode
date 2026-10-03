export type MorphologyFeature = {
  key: string;
  label: string;
  value: string;
};

export type MorphologySurfacePart = {
  sourceText: string;
  displayText: string;
  label: string;
  meaning: string;
  kind:
    | "whole"
    | "prefix"
    | "stem"
    | "suffix"
    | "article"
    | "preposition"
    | "connector"
    | "subject-marker"
    | "object-pronoun"
    | "possessive-pronoun"
    | "ending"
    | "other";
};

export type MorphologyFormationPart = {
  displayText: string;
  label: string;
  meaning: string;
  kind: "lemma" | "ending" | "pattern" | "other";
};

export type MorphologyAnalysis = {
  id: string;
  provider: string;
  recordKey: string;
  version: string;
  sourceText: string;
  lemma?: string;
  root?: string;
  pattern?: string;
  partOfSpeech?: string;
  features: MorphologyFeature[];
  segmentation?: MorphologySurfacePart[];
  formation?: MorphologyFormationPart[];
};

export function morphologyFeature(
  key: string,
  label: string,
  value: string,
): MorphologyFeature {
  return { key, label, value };
}
