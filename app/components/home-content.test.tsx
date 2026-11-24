import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import {
  HomeContent,
  type FeaturedCourse,
  type HomeContentProps,
} from "./home-content";

const course: FeaturedCourse = {
  id: 1,
  title: "Building REST APIs",
  slug: "building-rest-apis",
  description: "Design and ship an API.",
  coverImageUrl: null,
  instructorName: "Sam Instructor",
  lessonCount: 12,
};

function render(props: Partial<HomeContentProps> = {}) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <HomeContent
          featuredCourses={[course]}
          totalCourses={7}
          totalCategories={3}
          {...props}
        />
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("HomeContent", () => {
  it("puts the featured courses straight after the hero, before the stats", () => {
    const html = render();

    const hero = html.indexOf("Learn to code");
    const featured = html.indexOf("Featured Courses");
    const stats = html.indexOf("Available Courses");

    expect(hero).toBeGreaterThan(-1);
    expect(featured).toBeGreaterThan(hero);
    expect(stats).toBeGreaterThan(featured);
  });

  it("keeps the hero compact so the courses start on the first screen", () => {
    const html = render();

    expect(html).toMatch(/<section class="[^"]*\bpy-10\b[^"]*\bsm:py-14\b/);
    expect(html).toMatch(/<h1 class="text-4xl [^"]*sm:text-5xl"/);
    expect(html).not.toContain("py-24");
    expect(html).not.toContain("<br/>");
  });

  it("describes the featured courses as the newest, which is what they are", () => {
    const html = render();

    expect(html).toContain("Start learning with our newest courses");
    expect(html).not.toContain("most popular");
  });

  it("links each featured course card to its page with its lesson count", () => {
    const html = render();

    expect(html).toContain('href="/courses/building-rest-apis"');
    expect(html).toContain("Building REST APIs");
    expect(html).toContain("Sam Instructor");
    expect(html).toContain("12 lessons");
  });

  it("falls back to 'Instructor' when the course has no instructor name", () => {
    const html = render({
      featuredCourses: [{ ...course, instructorName: null }],
    });

    expect(html).toContain("Instructor");
    expect(html).not.toContain("Sam Instructor");
  });

  it("shows the course and category totals in the stats band", () => {
    const html = render();

    expect(html).toMatch(/>7<\/p><p[^>]*>Available Courses</);
    expect(html).toMatch(/>3<\/p><p[^>]*>Categories</);
    expect(html).toContain("Self-paced");
  });

  it("leaves out the featured section when there are no published courses", () => {
    const html = render({ featuredCourses: [] });

    expect(html).not.toContain("Featured Courses");
    expect(html).toContain("Learn to code");
    expect(html).toContain("Available Courses");
  });
});
