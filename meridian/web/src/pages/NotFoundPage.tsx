import { Link } from "react-router-dom";
import { Button } from "@/components/ui";
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-semibold text-brand-600 tnum">404</p>
      <h1 className="mt-4 text-xl font-semibold text-ink-900">Page not found</h1>
      <p className="mt-2 text-sm text-ink-500">The page you're looking for doesn't exist or was moved.</p>
      <Link to="/" className="mt-6"><Button>Back to dashboard</Button></Link>
    </div>
  );
}
