import crypto from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { getRuntimeSurahs } from "../app/data/db-lesson-service";
import { pool } from "./lib/db";
import type { Ayah, Surah, WordOccurrence } from "../app/data/fixtures";

type Kind = "ayah" | "surah" | "volume";
type PrintOptions = {
  pageSize: "A4" | "A5";
  grayscale: boolean;
  includeTranslation: boolean;
  includeTransliteration: boolean;
  includeRoots: boolean;
  includeGrammar: boolean;
  includeForms: boolean;
  includeDrills: boolean;
};

const args = process.argv.slice(2);
const kind = args[0] as Kind;
if (!(["ayah", "surah", "volume"] as Kind[]).includes(kind))
  throw new Error("Usage: generate-pdf.ts ayah|surah|volume");

function arg(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const options: PrintOptions = {
  pageSize: arg("--page-size") === "A5" ? "A5" : "A4",
  grayscale: args.includes("--grayscale"),
  includeTranslation: !args.includes("--no-translation"),
  includeTransliteration: !args.includes("--no-transliteration"),
  includeRoots: !args.includes("--no-roots"),
  includeGrammar: !args.includes("--no-grammar"),
  includeForms: !args.includes("--no-forms"),
  includeDrills: !args.includes("--no-drills"),
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lessonHtml(word: WordOccurrence, options: PrintOptions) {
  const lesson = word.lesson;
  const breakdown = word.breakdown ?? lesson?.breakdown;
  return `<article class="word-tree ${lesson ? "custom" : "source-only"}">
    <header><span class="word-number">Word ${word.position}</span><span>${escapeHtml(word.gloss || "Source word")}</span></header>
    <div class="word-arabic" dir="rtl">${escapeHtml(word.arabic)}</div>
    ${options.includeTransliteration && word.transliteration ? `<div class="transliteration">${escapeHtml(word.transliteration)}</div>` : ""}
    ${
      lesson
        ? `<div class="meaning">${escapeHtml(lesson.meaning)}</div>
      <div class="breakdown"><strong>Word breakdown</strong><div class="whole" dir="rtl">${escapeHtml(word.arabic)}</div><div class="arrow">↓</div><div class="parts">${(breakdown?.parts ?? []).map((part) => `<span><b dir="rtl">${escapeHtml(part.displayText)}</b><em>${escapeHtml(part.label)}</em><small>${escapeHtml(part.meaning)}</small></span>`).join("")}</div></div>
      ${options.includeRoots ? `<div class="detail"><strong>Root</strong><p dir="rtl">${escapeHtml(lesson.root || "No lexical root")}</p><span>${escapeHtml(lesson.rootPicture)}</span></div>` : ""}
      ${options.includeGrammar ? `<div class="detail"><strong>Grammar</strong><p>${escapeHtml(lesson.grammar)}</p><span>${escapeHtml(lesson.sentenceRole)}</span></div>` : ""}
      ${options.includeForms ? `<div class="detail"><strong>Ṣarf / form family</strong>${lesson.forms.map((form) => `<p><b dir="rtl">${escapeHtml(form.form)}</b> ${escapeHtml(form.meaning)} <small>${escapeHtml(form.difference)}</small></p>`).join("")}<span>${escapeHtml(lesson.takeaway)}</span></div>` : ""}`
        : `<div class="source-note">Source-only occurrence. Canonical text is available; reviewed Word Tree teaching has not yet been authored.</div>`
    }
  </article>`;
}

function ayahHtml(surah: Surah, ayah: Ayah, options: PrintOptions) {
  return `<section class="ayah-block">
    <header class="ayah-header"><span>${escapeHtml(surah.transliteration)} · Āyah ${ayah.number}</span><h2 dir="rtl">${escapeHtml(ayah.arabic)}</h2>${options.includeTranslation ? `<p>${escapeHtml(ayah.naturalMeaning || ayah.translation)}</p>` : ""}</header>
    <div class="word-grid">${ayah.words.map((word) => lessonHtml(word, options)).join("")}</div>
  </section>`;
}

function documentHtml(
  title: string,
  sections: string[],
  options: PrintOptions,
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: ${options.pageSize}; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #173f40; font-family: Georgia, 'Times New Roman', serif; background: #fffefa; }
    ${options.grayscale ? "* { filter: grayscale(1); }" : ""}
    h1,h2,p { margin: 0; } .cover { min-height: 240mm; display: grid; place-content: center; text-align: center; break-after: page; }
    .eyebrow, .word-number, .ayah-header > span { font: 10px Arial, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #d46c47; }
    .cover h1 { font-size: 34px; margin: 18px 0; } .cover p { color: #526563; font-style: italic; }
    .ayah-block { break-before: page; } .ayah-block:first-of-type { break-before: auto; }
    .ayah-header { text-align: center; border-bottom: 1px solid #dfe2dc; padding-bottom: 14px; margin-bottom: 14px; }
    .ayah-header h2 { font-size: 32px; font-weight: 500; margin: 16px 0 10px; line-height: 1.65; } .ayah-header p { font-style: italic; color: #526563; }
    .word-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .word-tree { border: 1px solid #dfe2dc; padding: 14px; break-inside: avoid; min-height: 90px; }
    .word-tree > header { display: flex; justify-content: space-between; gap: 10px; color: #526563; font: 10px Arial, sans-serif; text-transform: uppercase; letter-spacing: .08em; } .word-arabic { font-size: 29px; text-align: center; margin: 9px 0 1px; line-height: 1.55; } .transliteration,.meaning { text-align: center; color: #526563; font-size: 12px; } .meaning { margin-top: 4px; }
    .breakdown { margin-top: 12px; border-top: 1px solid #dfe2dc; padding-top: 10px; text-align: center; } .breakdown strong,.detail strong { display: block; font: 10px Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #0e5b5a; } .whole { font-size: 22px; margin-top: 5px; } .arrow { color: #d46c47; margin: 2px; }.parts { display:flex; justify-content:center; gap: 14px; flex-wrap: wrap; } .parts span { display:grid; gap: 2px; text-align:center; } .parts b { font-size: 20px; } .parts em,.parts small { font: 10px Arial,sans-serif; color:#526563; font-style:normal; }
    .detail { margin-top: 11px; border-top: 1px solid #dfe2dc; padding-top: 9px; text-align:center; } .detail p { margin-top: 5px; font-size: 17px; }.detail span,.detail small { font: 11px Arial,sans-serif; color:#526563; }.detail p b { margin-right: 6px; }.source-note { margin-top: 14px; padding: 11px; background: #f5f4ef; color: #526563; font: 12px Arial,sans-serif; text-align:center; }
    .credits { break-before: page; text-align:center; padding-top: 80px; color:#526563; font: 11px Arial,sans-serif; } .credits strong { display:block; color:#173f40; margin-bottom: 8px; }
    @media print { .word-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style></head><body><section class="cover"><span class="eyebrow">Qur’anic Arabic Word Tree</span><h1>${escapeHtml(title)}</h1><p>Canonical source text with reviewed teaching where available.</p></section>${sections.join("")}<section class="credits"><strong>Sources and credits</strong><p>Tanzil canonical text · project-authored teaching for Sūrahs 112–114.</p><p>Generated from PostgreSQL canonical content.</p></section></body></html>`;
}

const content = await getRuntimeSurahs();
const selectedSurah = Number(arg("--surah") ?? 114);
const selectedAyah = Number(arg("--ayah") ?? 1);
const surah = content.find((item) => item.number === selectedSurah);
if (!surah) throw new Error(`Sūrah ${selectedSurah} is not imported`);

let title: string;
let sections: string[];
let scope: Record<string, unknown>;
if (kind === "ayah") {
  const ayah = surah.ayahs.find((item) => item.number === selectedAyah);
  if (!ayah)
    throw new Error(
      `Āyah ${selectedAyah} is not present in Sūrah ${selectedSurah}`,
    );
  title = `${surah.transliteration} · Āyah ${selectedAyah}`;
  sections = [ayahHtml(surah, ayah, options)];
  scope = { type: "ayah", surah: selectedSurah, ayah: selectedAyah };
} else if (kind === "surah") {
  title = `${surah.transliteration} · Complete Sūrah`;
  sections = surah.ayahs.map((ayah) => ayahHtml(surah, ayah, options));
  scope = { type: "surah", surah: selectedSurah };
} else {
  const volumeSurahs = content.filter(
    (item) => item.number >= 109 && item.number <= 114,
  );
  title = "The Final Six Sūrahs";
  sections = volumeSurahs.flatMap((item) => [
    `<section class="ayah-block"><div class="ayah-header"><span>${escapeHtml(item.transliteration)}</span><h2>${escapeHtml(item.englishLabel)}</h2></div></section>`,
    ...item.ayahs.map((ayah) => ayahHtml(item, ayah, options)),
  ]);
  scope = {
    type: "volume",
    volume: "final-six-surahs",
    surahs: volumeSurahs.map((item) => item.number),
  };
}

const html = documentHtml(title, sections, options);
const fingerprint = crypto
  .createHash("sha256")
  .update(JSON.stringify({ scope, options, html }))
  .digest("hex");
const outputDir = path.join(process.cwd(), "artifacts", "generated-pdfs");
await mkdir(outputDir, { recursive: true });
const name =
  kind === "volume"
    ? "volume-final-six-surahs"
    : `${kind}-${selectedSurah}${kind === "ayah" ? `-${selectedAyah}` : ""}`;
const outputPath = path.join(outputDir, `${name}.pdf`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({
  path: outputPath,
  format: options.pageSize,
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    "<div style='width:100%;text-align:center;font:9px Arial;color:#526563'><span class='pageNumber'></span> / <span class='totalPages'></span></div>",
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
});
await browser.close();

const pdf = await readFile(outputPath);
const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [])
  .length;
await pool.query(
  `insert into generated_documents (id,kind,scope,print_options,content_fingerprint,status,output_path,page_count,created_at,updated_at)
  values ($1,$2,$3,$4,'${fingerprint}','succeeded',$5,$6,now(),now())
  on conflict (id) do update set print_options=excluded.print_options, content_fingerprint=excluded.content_fingerprint, status=excluded.status, output_path=excluded.output_path, page_count=excluded.page_count, updated_at=now()`,
  [
    `document:${kind}:${fingerprint}`,
    kind,
    JSON.stringify(scope),
    JSON.stringify(options),
    path.relative(process.cwd(), outputPath),
    pageCount,
  ],
);
await pool.end();
console.log(
  JSON.stringify({ kind, outputPath, pageCount, fingerprint }, null, 2),
);
