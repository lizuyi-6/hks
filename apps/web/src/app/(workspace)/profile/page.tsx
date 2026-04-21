import { ProfilePanel } from "@/components/profile-panel";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { onboarding } = await searchParams;
  if (onboarding === "true") {
    return <OnboardingWizard />;
  }
  return <ProfilePanel />;
}
