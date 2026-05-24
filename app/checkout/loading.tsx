import { PageLoader } from "@/components/ui/page-loader";

export default function Loading() {
  return <PageLoader label="Preparing checkout" hint="Validating your cart" />;
}
