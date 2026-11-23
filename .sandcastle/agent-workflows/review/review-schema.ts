import { z } from "zod/v4";

// The review's structured answer. The workflow renders the verdict from it
// (render-verdict.ts) and posts each left finding as an inline comment on its
// file and line (review.ts).
const axis = z
  .enum(["standards", "spec"])
  .describe(
    "standards: the repo's documented rules. spec: what the ticket asked for."
  );

const title = z
  .string()
  .min(1)
  .max(80)
  .describe("A short name for the finding, 80 characters at most.");

const rule = z
  .string()
  .min(1)
  .describe(
    "The rule it breaks: a heading in CODING_STANDARDS.md, or a line of the spec."
  );

const fixed = z.strictObject({
  axis,
  title,
  rule,
  status: z.literal("fixed"),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .describe("The sha of the commit that fixed it."),
});

const left = z
  .strictObject({
    axis,
    title,
    rule,
    status: z.literal("left"),
    path: z
      .string()
      .min(1)
      .describe("The file, relative to the repository root."),
    line: z
      .number()
      .int()
      .positive()
      .describe(
        "A line in the file as it is now, inside a hunk of the diff against the base. A comment outside the hunks is dropped."
      ),
    body: z
      .string()
      .min(1)
      .describe(
        "The finding, in Markdown: the rule or spec line it breaks, and what to do instead."
      ),
    reason: z
      .enum(["needs-human-decision", "too-large"])
      .describe(
        "needs-human-decision: a product or design call a person must make. too-large: the fix cannot fit this run."
      ),
    estimate: z
      .string()
      .min(1)
      .optional()
      .describe(
        "One line on why the fix cannot fit this run. Required when reason is too-large."
      ),
  })
  .refine((finding) => finding.reason !== "too-large" || finding.estimate, {
    message: "A too-large finding needs an estimate.",
    path: ["estimate"],
  });

const axisVerdict = z.strictObject({
  verdict: z
    .enum(["pass", "changes-requested"])
    .describe(
      "changes-requested when a finding on this axis is left. A fixed finding does not fail the axis."
    ),
  summary: z
    .string()
    .min(1)
    .describe("One sentence: the axis's verdict in plain words."),
});

export const reviewSchema = z
  .strictObject({
    standards: axisVerdict,
    spec: axisVerdict.describe(
      "No spec available: pass, and say so in the summary."
    ),
    findings: z
      .array(z.union([fixed, left]))
      .describe("Every finding, worst first. Empty when the change has none."),
    rulesWanted: z
      .array(z.string().min(1))
      .describe(
        "Rules you wanted to fail the change for that no standard covers. Empty is fine."
      ),
    humanQuestions: z
      .array(z.string().min(1))
      .describe(
        "Questions a person must answer before merging. Empty is fine."
      ),
  })
  .describe("The review: a verdict per axis, and every finding.");

export type Review = z.infer<typeof reviewSchema>;
export type Finding = Review["findings"][number];
export type LeftFinding = Extract<Finding, { status: "left" }>;
