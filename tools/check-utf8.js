/* eslint-disable no-console */
// UTF encoding guardrail: fail on UTF-16/UTF-8 BOM and invalid UTF-8.
// Usage: node tools/check-utf8.js

"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "out",
  ".vercel",
  "backups",
  "assets",
  "ui",
]);

const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".sql",
  ".txt",
  ".env",
  ".gitignore",
  ".editorconfig",
]);

function isTextFile(filePath) {
  const base = path.basename(filePath);
  if (TEXT_EXTS.has(base)) return true;
  return TEXT_EXTS.has(path.extname(filePath).toLowerCase());
}

function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function hasUtf16LeBom(buf) {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
}

function hasUtf16BeBom(buf) {
  return buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff;
}

function looksLikeUtf16Le(buf) {
  // Heuristic: lots of 0x00 in odd positions for ASCII-ish text.
  if (buf.length < 4) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 256));
  let zerosAtOdd = 0;
  let checked = 0;
  for (let i = 1; i < sample.length; i += 2) {
    checked++;
    if (sample[i] === 0x00) zerosAtOdd++;
  }
  return checked > 8 && zerosAtOdd / checked > 0.6;
}

function validateUtf8OrThrow(buf) {
  // TextDecoder with fatal ensures invalid sequences throw.
  const decoder = new TextDecoder("utf-8", { fatal: true });
  decoder.decode(buf);
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full, out);
      continue;
    }
    out.push(full);
  }
}

function rel(p) {
  return path.relative(repoRoot, p).replaceAll("\\", "/");
}

function main() {
  const files = [];
  walk(repoRoot, files);

  const failures = [];

  for (const f of files) {
    if (!isTextFile(f)) continue;
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch {
      continue;
    }

    if (hasUtf16LeBom(buf) || hasUtf16BeBom(buf) || looksLikeUtf16Le(buf)) {
      failures.push({
        file: rel(f),
        reason: "UTF-16 detected (Turbopack/Next expects UTF-8 source files).",
      });
      continue;
    }

    if (hasUtf8Bom(buf)) {
      failures.push({
        file: rel(f),
        reason: "UTF-8 BOM detected (avoid BOM to prevent tooling issues).",
      });
      continue;
    }

    try {
      validateUtf8OrThrow(buf);
    } catch {
      failures.push({
        file: rel(f),
        reason: "Invalid UTF-8 byte sequence detected.",
      });
    }
  }

  if (failures.length) {
    console.error("\nUTF encoding check failed:\n");
    for (const x of failures) {
      console.error(`- ${x.file}: ${x.reason}`);
    }
    console.error("\nFix: re-save the file as UTF-8 (no BOM).");
    process.exitCode = 1;
    return;
  }

  console.log("UTF encoding check passed (UTF-8, no BOM).");
}

main();









