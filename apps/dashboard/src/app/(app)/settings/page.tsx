import { Suspense } from "react";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { SettingsContent } from "./SettingsContent";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <h1>Settings</h1>
        <p className={styles.pageLead}>Manage your account and, where you have access, this shop.</p>
      </header>

      {/* SettingsContent reads ?tab= via useSearchParams, which needs a Suspense boundary */}
      <Suspense fallback={<ContentSkeleton variant="rows" rowCount={6} />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
