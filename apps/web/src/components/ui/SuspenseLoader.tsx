interface SuspenseLoaderProps {
  label?: string;
}

export const SuspenseLoader = ({ label = 'Loading...' }: SuspenseLoaderProps) => (
  <div className="suspense-loader" role="status" aria-live="polite">
    <div className="suspense-loader__inner">
      <span className="suspense-loader__spinner" aria-hidden="true" />
      <span className="suspense-loader__label">{label}</span>
    </div>
  </div>
);
