import { PresentationWordView } from "../../../../../prototype-app";
import { getClientContent } from "../../../../../data/runtime-content";

export default async function PresentationWordPage({
  params,
}: {
  params: Promise<{ surah: string; ayah: string; position: string }>;
}) {
  const route = await params;
  const content = await getClientContent(Number(route.surah), "six");
  return (
    <PresentationWordView
      surahNumber={Number(route.surah)}
      ayahNumber={Number(route.ayah)}
      wordPosition={Number(route.position)}
      content={content}
    />
  );
}
