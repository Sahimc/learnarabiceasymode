const completeSurah = process.argv.find((value) => value.startsWith("--surah-complete="));
if (!completeSurah) {
  throw new Error("Full-ledger refresh is allowed only after a completed sūrah. Usage: node scripts/refresh-compositional-gloss-audit-snapshot.mjs --surah-complete=N");
}

// Retain the previous command name, but use the bounded, stable-output renderer.
await import("./render-compositional-gloss-ledger.mjs");
