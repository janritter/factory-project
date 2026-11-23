import { describe, expect, it } from "vitest";
import { findViolations } from "./check-lint-exemptions";

const config = `{
  "overrides": [
    // Files already over a size limit. Remove each entry once the file is split.
    {
      "files": [
        "app/old.ts",
        "app/moved.ts",
        // moved from app/was-here.ts
        "app/moved-with-note.ts",
        "app/glob/**",
      ],
      "rules": {
        "max-lines": "off",
        "max-params": ["off"]
      }
    },
    {
      "files": ["app/other.ts"],
      "rules": { "max-lines-per-function": "off" }
    },
    {
      "files": ["app/not-size.ts"],
      "rules": { "import/no-default-export": "off" }
    }
  ]
}`;

describe("findViolations", () => {
  it("allows entries for files that already existed on the base", () => {
    expect(findViolations(config, ["app/unrelated.ts"])).toEqual([]);
  });

  it("flags a new file listed under a size rule and names the rules", () => {
    expect(findViolations(config, ["app/old.ts"])).toEqual([
      { file: "app/old.ts", rules: ["max-lines", "max-params"] },
    ]);
  });

  it("flags a new file exempted from a single size rule", () => {
    expect(findViolations(config, ["app/other.ts"])).toEqual([
      { file: "app/other.ts", rules: ["max-lines-per-function"] },
    ]);
  });

  it("permits a new file whose entry is preceded by a moved-from comment", () => {
    expect(findViolations(config, ["app/moved-with-note.ts"])).toEqual([]);
  });

  it("ignores entries that are not size rules and globs", () => {
    expect(
      findViolations(config, ["app/not-size.ts", "app/glob/a.ts"])
    ).toEqual([]);
  });
});
