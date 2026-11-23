import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "safe-sql-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function lint(source: string) {
  const file = join(dir, "fixture.ts");
  writeFileSync(file, source);
  try {
    execFileSync(
      "npx",
      ["oxlint", "-c", join(process.cwd(), ".oxlintrc.json"), file],
      { stdio: "pipe", cwd: process.cwd() }
    );
    return "";
  } catch (error) {
    return String((error as { stdout?: Buffer }).stdout);
  }
}

describe("safe-sql/no-dynamic-sql-raw", () => {
  it.each(['sql.raw("now()");', "sql.raw(`now()`);"])(
    "allows a static string: %s",
    (source) => {
      expect(lint(source)).not.toContain("no-dynamic-sql-raw");
    }
  );

  it.each([
    "sql.raw(`a ${x}`);",
    'sql.raw("a" + x);',
    "sql.raw(x);",
    "sql.raw();",
  ])("reports a dynamic argument: %s", (source) => {
    expect(lint(`declare const x: string;\n${source}`)).toContain(
      "no-dynamic-sql-raw"
    );
  });
});
