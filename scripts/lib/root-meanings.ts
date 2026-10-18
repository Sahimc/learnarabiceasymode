import rootMeaningData from "../../content-import/root-meanings.json";

export function normalizeRoot(root: string | null | undefined) {
  return (root ?? "").replace(/\s+/gu, "").trim();
}

export function rootMeaningFor(root: string) {
  const normalized = normalizeRoot(root);
  const meaning =
    rootMeaningData.meanings[
      normalized as keyof typeof rootMeaningData.meanings
    ];
  if (!meaning)
    throw new Error(
      `Missing reviewed English root meaning for normalized root ${normalized || "(empty)"}. Add it to content-import/root-meanings.json before authoring.`,
    );
  return meaning;
}

export function hasRootMeaning(root: string) {
  return Boolean(
    rootMeaningData.meanings[
      normalizeRoot(root) as keyof typeof rootMeaningData.meanings
    ],
  );
}
