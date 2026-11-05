import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const ts = require("typescript");
const dictionary = JSON.parse(
  readFileSync(path.join(root, "frontend/src/i18n/en.json"), "utf8"),
);
const patterns = JSON.parse(
  readFileSync(path.join(root, "frontend/src/i18n/patterns.json"), "utf8"),
);
const normalize = (s) => s.replace(/\s+/g, " ").trim();
const missing = new Set();
function inspectText(n) {
  if (ts.isStringLiteralLike(n)) {
    const value = normalize(n.text);
    if (/[가-힣]/.test(value) && !(value in dictionary)) missing.add(value);
  }
  if (ts.isTemplateExpression(n)) {
    const value = normalize(
      n.head.text +
        n.templateSpans.map((s, i) => `{${i}}` + s.literal.text).join(""),
    );
    if (/[가-힣]/.test(value) && !(value in patterns)) missing.add(value);
    return;
  }
  ts.forEachChild(n, inspectText);
}
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.name.endsWith(".tsx") && !file.endsWith("/i18n/react.tsx")) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function walk(n) {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === "ui" &&
          n.arguments[0]
        )
          inspectText(n.arguments[0]);
        ts.forEachChild(n, walk);
      }
      walk(source);
    }
  }
}
scan(path.join(root, "frontend/src"));
if (missing.size) {
  console.error(
    "Missing English UI entries:\n" + [...missing].sort().join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    `English UI coverage: ${Object.keys(dictionary).length} entries and ${Object.keys(patterns).length} templates verified.`,
  );
