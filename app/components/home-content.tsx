import { Link } from "react-router";
import { ArrowRight, BookOpen, GraduationCap, User, Users } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import { CourseImage } from "~/components/course-image";

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string | null;
  lessonCount: number;
};

export type HomeContentProps = {
  featuredCourses: FeaturedCourse[];
  totalCourses: number;
  totalCategories: number;
};

/** The start page between its header and footer: hero, featured courses, stats. */
export function HomeContent({
  featuredCourses,
  totalCourses,
  totalCategories,
}: HomeContentProps) {
  return (
    <>
      <div className="flex min-h-[calc(100svh-4rem)] flex-col justify-center">
        <HomeHero />
        {featuredCourses.length > 0 && (
          <FeaturedCourses courses={featuredCourses} />
        )}
      </div>
      <HomeStats
        totalCourses={totalCourses}
        totalCategories={totalCategories}
      />
    </>
  );
}

function HomeHero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-6 text-center sm:pt-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
        Learn to code,{" "}
        <span className="text-muted-foreground">at your own pace</span>
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
        Structured courses built by experienced instructors. Track your
        progress, take quizzes, and build real-world skills.
      </p>
      <div className="mt-5 flex items-center justify-center gap-4">
        <Button asChild size="lg">
          <Link to="/courses">
            Browse Courses
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function FeaturedCourses({ courses }: { courses: FeaturedCourse[] }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Featured Courses
          </h2>
          <p className="mt-1 text-muted-foreground">
            Start learning with our newest courses
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/courses">
            View all
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <FeaturedCourseCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
}

function FeaturedCourseCard({ course }: { course: FeaturedCourse }) {
  return (
    <Link to={`/courses/${course.slug}`} className="group">
      <Card className="h-full overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
        <CourseImage
          src={course.coverImageUrl}
          alt={course.title}
          className="aspect-video w-full object-cover"
        />
        <CardHeader>
          <h3 className="font-semibold leading-snug group-hover:text-primary">
            {course.title}
          </h3>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="size-3" />
            {course.instructorName ?? "Instructor"}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="size-3" />
            {course.lessonCount} lessons
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

function HomeStats({
  totalCourses,
  totalCategories,
}: {
  totalCourses: number;
  totalCategories: number;
}) {
  return (
    <section className="border-y border-border bg-muted/50 py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 sm:grid-cols-3">
        <Stat icon={BookOpen} value={totalCourses} label="Available Courses" />
        <Stat icon={GraduationCap} value={totalCategories} label="Categories" />
        <Stat icon={Users} value="Self-paced" label="Learn on your schedule" />
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BookOpen;
  value: number | string;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
