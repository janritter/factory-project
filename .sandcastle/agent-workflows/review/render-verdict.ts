import * as fs from "node:fs";
import * as path from "node:path";
import type { Finding, Review } from "./review-schema";

// The verdict comment, rendered from the review's structured output. The
// agent never writes it. The workflow greps the first heading for
// `## Standards:` to decide the PR is ready, so the first line keeps that.
//
// A left finding gets one table row and nothing more: its detail is in the
// inline comment on its line.

const AXES = { standards: "Standards", spec: "Spec" } as const;

const VERDICTS = {
  pass: "PASS",
  "changes-requested": "CHANGES REQUESTED",
} as const;

const oneLine = (text: string): string =>
  text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

const isLeft = (
  finding: Finding
): finding is Extract<Finding, { status: "left" }> => finding.status === "left";

const statusCell = (finding: Finding): string => {
  if (finding.status === "fixed") return `🔧 \`${finding.commit.slice(0, 7)}\``;
  if (finding.reason === "needs-human-decision") return "🧭 ask a human";
  return "💬 inline";
};

// Screenshots the agent saved, as the absolute paths the workflow's attach
// step looks for. Empty when there are none.
export const evidenceIn = (dir = "/tmp/evidence"): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => path.join(dir, name));
};

const renderEvidence = (evidence: string[]): string[] => {
  if (evidence.length === 0) return [];
  return [
    "<details>",
    "<summary>Screenshots</summary>",
    "",
    ...evidence.map((file) => `![${path.basename(file, ".png")}](${file})`),
    "",
    "</details>",
    "",
  ];
};

const renderRules = (rules: string[]): string[] => [
  "<details>",
  `<summary>Rules this review wanted and could not find (${rules.length})</summary>`,
  "",
  ...(rules.length > 0 ? rules.map((rule) => `- ${oneLine(rule)}`) : ["None."]),
  "",
  "</details>",
  "",
];

export const renderVerdict = (review: Review, evidence: string[]): string => {
  const findings = review.findings;
  const fixedCount = findings.filter((f) => f.status === "fixed").length;
  const left = findings.filter(isLeft);
  const forHuman = left.filter((f) => f.reason === "needs-human-decision");

  const out: string[] = [];

  for (const axis of ["standards", "spec"] as const) {
    const { verdict, summary } = review[axis];
    out.push(
      `## ${AXES[axis]}: ${VERDICTS[verdict]}`,
      "",
      oneLine(summary),
      ""
    );
  }

  out.push(
    `🔧 ${fixedCount} fixed · 💬 ${left.length} left · 🧭 ${forHuman.length} for you`,
    ""
  );

  if (findings.length > 0) {
    out.push("| Axis | Finding | Status |", "| --- | --- | --- |");
    for (const finding of findings) {
      out.push(
        `| ${AXES[finding.axis]} | ${oneLine(finding.title)} | ${statusCell(finding)} |`
      );
    }
    out.push("");
  }

  if (review.humanQuestions.length > 0) {
    out.push("**Questions for you**", "");
    for (const question of review.humanQuestions) {
      out.push(`- ${oneLine(question)}`);
    }
    out.push("");
  }

  out.push(...renderEvidence(evidence));

  out.push(...renderRules(review.rulesWanted));

  return out.join("\n");
};
