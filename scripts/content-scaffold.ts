import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverPackagePaths, readPackage } from "./lib/packages";

const args = process.argv.slice(2);
const index = args.indexOf("--surah");
const number = index >= 0 ? Number(args[index + 1]) : NaN;
if (!Number.isInteger(number) || number < 1 || number > 114) {
  throw new Error("Usage: npm run content:scaffold -- --surah 108");
}

const sourcePath = (await discoverPackagePaths()).find((file) =>
  file.includes(`${String(number).padStart(3, "0")}-`),
);
if (!sourcePath)
  throw new Error(`No generated source package exists for Sūrah ${number}`);
const source = await readPackage(sourcePath);
if (!source.package) throw new Error(source.errors.join("\n"));

const scaffold = {
  ...source.package,
  packageId: `scaffold:${number}`,
  contentVersion: `${source.package.contentVersion}-authoring-scaffold`,
  status: "custom-partial",
  teachingEntries: {},
  sourceReferences: [
    ...source.package.sourceReferences,
    {
      provider: "project",
      recordKey: "authoring-scaffold",
      version: "1",
      attribution: "Custom fields intentionally left incomplete",
    },
  ],
};

const output = path.join(
  process.cwd(),
  "content-import",
  "scaffolds",
  `${String(number).padStart(3, "0")}.json`,
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(scaffold, null, 2)}\n`, "utf8");
console.log(`Created source-backed custom-partial scaffold: ${output}`);
console.log(
  "Custom teaching fields remain incomplete; do not import this scaffold as custom-complete.",
);
