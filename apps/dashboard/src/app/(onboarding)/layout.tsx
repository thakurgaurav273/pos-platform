import { OnboardingGate } from "@/components/Onboarding/OnboardingGate";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingGate>{children}</OnboardingGate>;
}
