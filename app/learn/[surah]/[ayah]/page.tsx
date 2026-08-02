import { PrototypeApp } from "../../../prototype-app";
import { getClientContent } from "../../../data/runtime-content";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ surah: string; ayah: string }>;
}) {
  const route = await params;
  const content = await getClientContent(Number(route.surah), "six");
  return (
    <PrototypeApp
      view="lesson"
      initialSurah={Number(route.surah)}
      initialAyah={Number(route.ayah)}
      content={content}
    />
  );
}
