import { PresentationWordView } from "../../../../../prototype-app";

export default async function PresentationWordPage({
  params,
}: {
  params: Promise<{ surah: string; ayah: string; position: string }>;
}) {
  const route = await params;
  return (
    <PresentationWordView
      surahNumber={Number(route.surah)}
      ayahNumber={Number(route.ayah)}
      wordPosition={Number(route.position)}
    />
  );
}
