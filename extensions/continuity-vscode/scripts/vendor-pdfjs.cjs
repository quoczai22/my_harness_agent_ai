// Copies the minimal pdf.js legacy build, its character maps and its license into dist/vendor/pdfjs.
// .vscodeignore excludes node_modules, so the VSIX only carries what is copied here.
const { cpSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "dist", "vendor", "pdfjs");
mkdirSync(target, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) cpSync(join(source, "legacy", "build", file), join(target, file));
cpSync(join(source, "cmaps"), join(target, "cmaps"), { recursive: true });
cpSync(join(source, "LICENSE"), join(target, "LICENSE"));
