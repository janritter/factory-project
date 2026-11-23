import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { LessonNote, type LessonNoteData } from "./lesson-note";

function render(note: LessonNoteData) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <LessonNote note={note} /> },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("LessonNote", () => {
  it("renders an empty note box with a save-note form", () => {
    const html = render(null);

    expect(html).toContain("Your notes");
    expect(html).toContain('name="intent" value="save-note"');
    expect(html).toMatch(/<textarea[^>]*name="body"[^>]*><\/textarea>/);
    expect(html).not.toContain("Last edited");
  });

  it("prefills the saved note and shows when it was last edited", () => {
    const html = render({
      body: "Cursor pagination beats offset",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(html).toContain("Cursor pagination beats offset");
    expect(html).toContain("Last edited");
  });

  it("matches the Questions & Discussion card instead of doubling its padding", () => {
    const html = render(null);

    expect(html).toMatch(/data-slot="card"[^>]*class="[^"]*\bpy-0\b/);
    expect(html).toMatch(/<h2 class="text-xl font-semibold">Your notes<\/h2>/);
  });
});
