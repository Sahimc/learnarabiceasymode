import { PrototypeApp } from "../prototype-app";

export default async function PresentationPage({
  searchParams,
}: {
  searchParams: Promise<{ surah?: string; ayah?: string }>;
}) {
  const query = await searchParams;
  return (
    <PrototypeApp
      view="presentation"
      initialSurah={Number(query.surah) || 114}
      initialAyah={Number(query.ayah) || 1}
    />
  );
}
