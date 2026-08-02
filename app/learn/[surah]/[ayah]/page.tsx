import { PrototypeApp } from "../../../prototype-app";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ surah: string; ayah: string }>;
}) {
  const route = await params;
  return (
    <PrototypeApp
      view="lesson"
      initialSurah={Number(route.surah)}
      initialAyah={Number(route.ayah)}
    />
  );
}
