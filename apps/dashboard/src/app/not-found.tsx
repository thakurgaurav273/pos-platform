import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-128px)] flex-col items-center justify-center">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 shadow-sm text-center max-w-md">
        <p className="text-8xl font-bold text-[var(--ochre-300)] leading-none">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
          Page not found
        </h1>
        <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-[var(--ochre-500)] px-6 py-3 text-sm font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--ochre-600)]"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
