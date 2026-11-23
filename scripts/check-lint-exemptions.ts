/**
 * Fails when a file that is new since the base branch is exempted from a
 * size rule in `.oxlintrc.json`.
 *
 * The overrides list files that are already over a size limit. Removing an
 * entry is the only way out, so a new file on that list would start life
 * over the limit. Entries for files that already exist on the base may stay.
 *
 * A file moved from an exempt file keeps its exemption if its entry is
 * preceded by a `// moved from <old path>` comment, on the line above or on
 * the same line.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const CONFIG = ".oxlintrc.json";
const BASE_REFS = ["origin/main", "main"];
const SIZE_RULES = [
  "max-lines",
  "max-lines-per-function",
  "max-params",
  "max-depth",
];
const GLOB_CHARS = /[*?[\]{}]/;
const MOVED_FROM = /\/\/\s*moved from\s+\S/;

export type Violation = { file: string; rules: string[] };

type Override = { files?: unknown; rules?: Record<string, unknown> };

function isOff(level: unknown): boolean {
  const value = Array.isArray(level) ? level[0] : level;
  return value === "off";
}

function sizeRulesOff(override: Override): string[] {
  const rules = override.rules ?? {};
  return SIZE_RULES.filter((rule) => isOff(rules[rule]));
}

function hasHatch(lines: string[], index: number): boolean {
  return (
    MOVED_FROM.test(lines[index]) ||
    (index > 0 && MOVED_FROM.test(lines[index - 1]))
  );
}

function entryLines(lines: string[], file: string): number[] {
  const quoted = JSON.stringify(file);
  return lines.flatMap((line, index) => (line.includes(quoted) ? [index] : []));
}

/** Literal file entries of every override that switches off a size rule. */
function exemptionEntries(config: Override[]) {
  return config.flatMap((override) => {
    const rules = sizeRulesOff(override);
    const files = Array.isArray(override.files) ? override.files : [];
    if (rules.length === 0) return [];
    return files
      .filter((f): f is string => typeof f === "string")
      .filter((f) => !GLOB_CHARS.test(f))
      .map((file) => ({ file, rules }));
  });
}

/**
 * Returns one violation per exemption entry that names a new file and has
 * no `moved from` comment. `text` is the raw `.oxlintrc.json`, which may
 * contain comments; `newFiles` are the paths added since the base.
 */
export function findViolations(text: string, newFiles: string[]): Violation[] {
  const parsed = ts.parseConfigFileTextToJson(CONFIG, text);
  if (parsed.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")
    );
  const config: Override[] = parsed.config.overrides ?? [];
  const lines = text.split("\n");
  const added = new Set(newFiles);

  return exemptionEntries(config)
    .filter(({ file }) => added.has(file))
    .filter(({ file }) => {
      const occurrences = entryLines(lines, file);
      return (
        occurrences.length === 0 ||
        !occurrences.every((i) => hasHatch(lines, i))
      );
    })
    .map(({ file, rules }) => ({ file, rules }));
}

function git(args: string[]): string[] {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0);
}

function refExists(ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Files added since the base, including untracked ones not yet staged. */
function newFilesSince(base: string): string[] {
  return [
    ...git(["diff", "--diff-filter=A", "--no-renames", "--name-only", base]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ];
}

function main() {
  const base = BASE_REFS.find(refExists);
  if (!base) {
    console.log(
      `lint:exemptions skipped: neither ${BASE_REFS.join(" nor ")} exists.`
    );
    return;
  }
  const violations = findViolations(
    readFileSync(CONFIG, "utf8"),
    newFilesSince(base)
  );
  if (violations.length === 0) {
    console.log(`lint:exemptions: no new file is exempted (base ${base}).`);
    return;
  }
  for (const { file, rules } of violations) {
    console.error(
      `${file} is new since ${base}, but ${CONFIG} exempts it from ${rules.join(", ")}. ` +
        `Split the code instead. If the file was moved from an exempt file, ` +
        `add a "// moved from <old path>" comment above its entry.`
    );
  }
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
