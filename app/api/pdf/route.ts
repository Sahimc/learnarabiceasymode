import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "ayah";
  const surah = Number(params.get("surah") ?? 114);
  const ayah = Number(params.get("ayah") ?? 1);
  const filename =
    kind === "volume"
      ? "volume-final-six-surahs.pdf"
      : kind === "surah"
        ? `surah-${surah}.pdf`
        : `ayah-${surah}-${ayah}.pdf`;
  const filePath = path.join(
    process.cwd(),
    "artifacts",
    "generated-pdfs",
    filename,
  );
  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "PDF has not been generated for this scope yet", filename },
      { status: 404 },
    );
  }
}
