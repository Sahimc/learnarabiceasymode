import { PrototypeApp } from "./prototype-app";
import { getClientContent } from "./data/runtime-content";

export default async function Home() {
  const content = await getClientContent(114, "six");
  return <PrototypeApp view="home" content={content} />;
}
