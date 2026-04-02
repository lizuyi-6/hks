import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export default async function WorkspaceLayout({
  children
}: {
  children: ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "/dashboard";

  return <AppShell pathname={pathname}>{children}</AppShell>;
}
