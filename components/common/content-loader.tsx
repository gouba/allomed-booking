import { LoaderCircleIcon } from 'lucide-react';

export function ContentLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`content-loader ${className}`.trim()}>
      <div className="content-loader-inner">
        <LoaderCircleIcon className="content-loader-icon" aria-hidden="true" />
        <span>Loading...</span>
      </div>
    </div>
  );
}
