import Spinner from "@/components/Spinner"

// Without this, the dashboard's async server component (auth() + a /me
// call to resolve which role-specific dashboard to redirect to) renders
// nothing at all while it awaits — a blank page with no feedback, easily
// mistaken for the app being stuck even though it's just waiting on a
// slow request (e.g. a cold database connection pool).
export default function DashboardLoading() {
  return <Spinner fullScreen size="lg" />
}
