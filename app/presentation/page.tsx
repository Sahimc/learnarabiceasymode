import { PrototypeApp } from "../prototype-app";
import { getClientContent } from "../data/runtime-content";

export default async function PresentationPage({
  searchParams,
}: {
  searchParams: Promise<{ surah?: string; ayah?: string }>;
}) {
  const query = await searchParams;
  const content = await getClientContent(Number(query.surah) || 114, "six");
  return (
    <PrototypeApp
      view="presentation"
      initialSurah={Number(query.surah) || 114}
      initialAyah={Number(query.ayah) || 1}
      content={content}
    />
  );
}
