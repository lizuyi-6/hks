import { notFound } from "next/navigation";
import { WorkshopShell } from "@/components/workshop/WorkshopShell";

export default function WorkshopPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_WORKSHOP !== "1"
  ) {
    notFound();
  }

  return <WorkshopShell />;
}
