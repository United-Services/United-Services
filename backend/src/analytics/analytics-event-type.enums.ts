// AnalyticsEvent.eventType isn't a Prisma enum (see schema.prisma —
// it's deliberately a free-form string so the frontend can add new event
// types without a migration), but the handful of values this controller
// actually queries for are still worth naming once rather than repeating
// as raw string literals.
export enum AnalyticsEventType {
  PageView = 'page_view',
}

// Prefixes used with a `startsWith` filter, since these event types are
// namespaced (e.g. "cta_click_hero", "service_page_view_gre-coating").
export enum AnalyticsEventTypePrefix {
  CtaClick = 'cta_click',
  ServicePageView = 'service_page_view',
}
