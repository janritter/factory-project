// Pure interface: the caller supplies the database and the clock. Tests use
// this seam with an in-memory database. The route does not; it uses ./server.
export {
  getAnalyticsOptions,
  getCourseReport,
  getOverview,
} from "./lib/instructor-analytics.server";

export type {
  AnalyticsOptions,
  AnalyticsScope,
  CourseCountryRevenue,
  CourseFunnel,
  CourseProgressSummary,
  CourseReport,
  FunnelLesson,
  Overview,
  QuizPassRate,
  RefundExposure,
  RevenueSeries,
} from "./lib/instructor-analytics.server";
