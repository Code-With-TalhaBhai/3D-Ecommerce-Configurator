import { PageLoader } from "@/components/ui/page-loader";

// Root-level fallback. Activates when a top-level route doesn't define its own
// loading.tsx — gives every navigation an immediate, branded shell.
export default function Loading() {
  return <PageLoader variant="fullscreen" hint="Preparing the marketplace" />;
}
