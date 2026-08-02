import { PrototypeApp } from "../prototype-app";
import { getClientContent } from "../data/runtime-content";

export default async function SurahsPage() {
  const content = await getClientContent(114, "all");
  return <PrototypeApp view="surahs" initialSurah={114} content={content} />;
}
