import { LoaderCircleIcon } from 'lucide-react';

export function ContentLoader({ className = '', label = 'Loading...' }: { className?: string; label?: string }) {
  return (
    <div className={`content-loader ${className}`.trim()} role="status">
      <div className="content-loader-inner">
        <LoaderCircleIcon className="content-loader-icon" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}
