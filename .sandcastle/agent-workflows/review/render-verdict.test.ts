import { describe, expect, it } from "vitest";
import { renderVerdict } from "./render-verdict";
import { type Review, reviewSchema } from "./review-schema";

// A made-up review shaped like a real run: two fixes, two findings left
// (one needs a person, one is too large for this run), one rule not found.
const review: Review = {
  standards: {
    verdict: "changes-requested",
    summary: "Two fixed, two left: one needs a product call, one is too large.",
  },
  spec: {
    verdict: "pass",
    summary: "The ticket's filter works as asked.",
  },
  findings: [
    {
      axis: "standards",
      title: "Route imports the db directly",
      rule: "Modules own their data",
      status: "fixed",
      commit: "9f2c1ab4e7d0",
    },
    {
      axis: "standards",
      title: "Quiz card repeats the doubled padding | fix",
      rule: "Spacing tokens",
      status: "fixed",
      commit: "03aa7de1",
    },
    {
      axis: "standards",
      title: "Missing pagination limit",
      rule: "Bounded queries",
      status: "left",
      path: "app/modules/threads/get-thread.ts",
      line: 14,
      body: "SECRET-DETAIL-THAT-MUST-STAY-INLINE",
      reason: "too-large",
      estimate: "Needs a cursor API change across three callers.",
    },
    {
      axis: "standards",
      title: "Lesson order is a product call",
      rule: "Ordering rules",
      status: "left",
      path: "app/modules/lessons/order.ts",
      line: 3,
      body: "Another inline-only body.",
      reason: "needs-human-decision",
    },
  ],
  rulesWanted: ["Route loaders call a module entry point, never the db"],
  humanQuestions: ["Should lessons sort by position or by created date?"],
};

const evidence = ["/tmp/evidence/after.png"];

describe("renderVerdict", () => {
  const md = renderVerdict(review, evidence);
  const lines = md.split("\n");

  it("starts with the heading the workflow greps for", () => {
    expect(lines[0]).toBe("## Standards: CHANGES REQUESTED");
    expect(md).toContain("## Standards:");
  });

  it("gives the spec axis its own heading", () => {
    expect(md).toContain("## Spec: PASS");
  });

  it("writes the scoreboard on one line", () => {
    expect(md).toContain("🔧 2 fixed · 💬 2 left · 🧭 1 for you");
  });

  it("puts one table row per finding with its status", () => {
    expect(md).toContain("| Axis | Finding | Status |");
    expect(md).toContain(
      "| Standards | Route imports the db directly | 🔧 `9f2c1ab` |"
    );
    expect(md).toContain(
      "| Standards | Missing pagination limit | 💬 inline |"
    );
    expect(md).toContain(
      "| Standards | Lesson order is a product call | 🧭 ask a human |"
    );
  });

  it("escapes pipes in titles so the table holds", () => {
    expect(md).toContain("Quiz card repeats the doubled padding \\| fix");
  });

  it("does not restate what the inline comment carries", () => {
    expect(md).not.toContain("SECRET-DETAIL-THAT-MUST-STAY-INLINE");
    expect(md).not.toContain("Another inline-only body.");
  });

  it("embeds the screenshots by absolute path, collapsed", () => {
    expect(md).toContain("<summary>Screenshots</summary>");
    expect(md).toContain("![after](/tmp/evidence/after.png)");
  });

  it("collapses the rules that could not be found, and lists the questions", () => {
    expect(md).toContain(
      "<summary>Rules this review wanted and could not find (1)</summary>"
    );
    expect(md).toContain(
      "- Route loaders call a module entry point, never the db"
    );
    expect(md).toContain("**Questions for you**");
  });

  it("omits the screenshots block when there are none", () => {
    expect(renderVerdict(review, [])).not.toContain(
      "<summary>Screenshots</summary>"
    );
  });

  it("renders an empty review without a table", () => {
    const empty: Review = {
      standards: { verdict: "pass", summary: "Nothing to change." },
      spec: { verdict: "pass", summary: "No spec available." },
      findings: [],
      rulesWanted: [],
      humanQuestions: [],
    };
    const out = renderVerdict(empty, []);
    expect(out).toContain("## Standards: PASS");
    expect(out).toContain("🔧 0 fixed · 💬 0 left · 🧭 0 for you");
    expect(out).not.toContain("| Axis |");
    expect(out).toContain("None.");
  });
});

describe("reviewSchema", () => {
  const base = { standards: review.standards, spec: review.spec };

  it("accepts a too-large finding with an estimate", () => {
    expect(reviewSchema.safeParse({ ...base, ...review }).success).toBe(true);
  });

  it("rejects a too-large finding without an estimate", () => {
    const [, , tooLarge] = review.findings;
    const { estimate: _estimate, ...withoutEstimate } = tooLarge as Extract<
      Review["findings"][number],
      { status: "left" }
    >;
    const result = reviewSchema.safeParse({
      ...base,
      findings: [withoutEstimate],
      rulesWanted: [],
      humanQuestions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a reason outside the two allowed", () => {
    const result = reviewSchema.safeParse({
      ...base,
      findings: [{ ...review.findings[3], reason: "pre-existing" }],
      rulesWanted: [],
      humanQuestions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title over 80 characters", () => {
    const result = reviewSchema.safeParse({
      ...base,
      findings: [{ ...review.findings[0], title: "x".repeat(81) }],
      rulesWanted: [],
      humanQuestions: [],
    });
    expect(result.success).toBe(false);
  });
});
