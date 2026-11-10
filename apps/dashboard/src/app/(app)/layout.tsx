import { AppLayout } from "./AppLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SubscriptionProvider>
        <AppLayout>{children}</AppLayout>
      </SubscriptionProvider>
    </AuthGuard>
  );
}
