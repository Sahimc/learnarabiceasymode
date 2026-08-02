import { PrototypeApp } from "../prototype-app";
import { getClientContent } from "../data/runtime-content";

export default async function PrintPage() {
  const content = await getClientContent(114, "six");
  return (
    <PrototypeApp
      view="print"
      initialSurah={114}
      initialAyah={1}
      content={content}
    />
  );
}
