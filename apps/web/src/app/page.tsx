import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default async function HomePage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  redirect("/login");
}

