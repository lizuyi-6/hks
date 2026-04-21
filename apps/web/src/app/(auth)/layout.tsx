import type { ReactNode } from "react";
import { AuroraBg } from "@/components/aurora-bg";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <AuroraBg />
      {children}
    </div>
  );
}
