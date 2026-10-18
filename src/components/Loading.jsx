import { LoaderCircle } from 'lucide-react';

export function LoadingSpinner({ label = 'Loading', size = 18 }) {
  return <span className="loading-inline" role="status" aria-live="polite">
    <LoaderCircle className="spin" size={size} aria-hidden="true" />
    <span>{label}</span>
  </span>;
}

export function ConversationSkeleton({ rows = 5 }) {
  return <div className="conversation-skeleton" aria-label="Loading conversations" role="status">
    {Array.from({ length: Math.max(1, Math.min(rows, 12)) }, (_, index) =>
      <div className="skeleton-row" key={index}>
        <span className="skeleton-avatar" />
        <span className="skeleton-copy"><i /><i /></span>
      </div>
    )}
    <span className="sr-only">Loading conversations…</span>
  </div>;
}
