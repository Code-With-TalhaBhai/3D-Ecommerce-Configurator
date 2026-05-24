import { PageLoader } from "@/components/ui/page-loader";

export default function Loading() {
  return (
    <PageLoader
      label="Finalising your order"
      hint="We're confirming the payment with our processor"
    />
  );
}
