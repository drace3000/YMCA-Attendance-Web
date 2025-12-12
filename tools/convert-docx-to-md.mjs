import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import mammoth from "mammoth";
import TurndownService from "turndown";
import turndownPluginGfm from "turndown-plugin-gfm";
import { JSDOM } from "jsdom";

function usageAndExit(code = 1) {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  node tools/convert-docx-to-md.mjs <input.docx> [output.md]",
      "",
      "Examples:",
      '  node tools/convert-docx-to-md.mjs "documents/YMCA_Attendance_Scheduling_PRD.docx"',
      '  node tools/convert-docx-to-md.mjs "documents/YMCA_Attendance_Scheduling_PRD.docx" "documents/YMCA_Attendance_Scheduling_PRD.md"',
    ].join("\n")
  );
  process.exit(code);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeBasename(name) {
  return name.replace(/[^\w.\-]+/g, "_");
}

function guessExt(contentType) {
  // Minimal mapping; extend as needed.
  if (!contentType) return "bin";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("webp")) return "webp";
  return "bin";
}

async function main() {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];

  if (!inputArg) usageAndExit(1);

  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    // eslint-disable-next-line no-console
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const defaultOutputPath = inputPath.replace(/\.docx$/i, ".md");
  const outputPath = path.resolve(process.cwd(), outputArg ?? defaultOutputPath);

  const outputDir = path.dirname(outputPath);
  ensureDir(outputDir);

  const mediaDir = path.join(outputDir, "media");
  ensureDir(mediaDir);

  let imageCounter = 0;

  const { value: html, messages } = await mammoth.convertToHtml(
    { path: inputPath },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
      ],
      convertImage: mammoth.images.imgElement(async (image) => {
        imageCounter += 1;
        const ext = guessExt(image.contentType);
        const base = sanitizeBasename(
          `${path.basename(inputPath, path.extname(inputPath))}_img_${String(imageCounter).padStart(3, "0")}.${ext}`
        );
        const outFile = path.join(mediaDir, base);
        const buffer = await image.read("buffer");
        fs.writeFileSync(outFile, buffer);

        // Use a relative path in the Markdown output.
        const rel = path.relative(outputDir, outFile).split(path.sep).join("/");
        return { src: rel };
      }),
    }
  );

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    bulletListMarker: "-",
  });

  turndown.use(turndownPluginGfm.gfm);
  turndown.use(turndownPluginGfm.tables);

  // Mammoth often produces <td><p>...</p></td>, which prevents GFM table conversion.
  // Normalize table cells by unwrapping direct <p> children so tables render as Markdown.
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;

  // Ensure tables have a header row (<th>) so GFM table conversion can kick in.
  doc.querySelectorAll("table").forEach((table) => {
    const firstRow = table.querySelector("tr");
    if (!firstRow) return;

    const hasTh = firstRow.querySelector("th") !== null;
    if (hasTh) return;

    // Promote first-row <td> cells to <th>.
    firstRow.querySelectorAll("td").forEach((td) => {
      const th = doc.createElement("th");
      th.innerHTML = td.innerHTML;
      td.replaceWith(th);
    });
  });

  doc.querySelectorAll("td, th").forEach((cell) => {
    const ps = Array.from(cell.querySelectorAll(":scope > p"));
    if (ps.length === 0) return;

    const parts = ps
      .map((p) => (p.innerHTML ?? "").trim())
      .filter((s) => s.length > 0);

    cell.innerHTML = parts.join("<br/>");
  });

  const normalizedHtml = doc.body.innerHTML;

  // Keep line breaks from Word a bit more faithfully.
  turndown.addRule("preserveLineBreaks", {
    filter: ["br"],
    replacement: () => "  \n",
  });

  const md = turndown.turndown(normalizedHtml);

  const frontMatter = [
    `<!--`,
    `Generated from ${path.basename(inputPath)} using mammoth + turndown.`,
    `Images (if any) extracted to: ${path.relative(process.cwd(), mediaDir).split(path.sep).join("/")}`,
    `-->`,
    ``,
  ].join("\n");

  fs.writeFileSync(outputPath, frontMatter + md + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.log(`Wrote: ${outputPath}`);
  if (messages?.length) {
    // eslint-disable-next-line no-console
    console.log("\nMammoth messages:\n" + messages.map((m) => `- ${m.type}: ${m.message}`).join("\n"));
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


