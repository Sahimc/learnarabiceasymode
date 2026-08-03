import { getRuntimeSurahs } from "./db-lesson-service";
import type { Surah } from "./fixtures";

export async function getClientContent(
  selectedNumber: number,
  scope: "six" | "all" = "six",
): Promise<Surah[]> {
  const all = await getRuntimeSurahs();
  const selected =
    all.find((surah) => surah.number === selectedNumber) ?? all[all.length - 1];
  const candidates =
    scope === "all" ? all : all.filter((surah) => surah.number >= 109);
  const visible = candidates.some((surah) => surah.number === selected.number)
    ? candidates
    : [selected, ...candidates];
  return visible.map((surah) =>
    surah.number === selected.number ? selected : { ...surah, ayahs: [] },
  );
}
