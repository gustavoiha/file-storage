import type { PropsWithChildren, ReactNode } from 'react';
import '@/styles/layout.css';

interface PageProps {
  className?: string;
  title?: string;
  headerActions?: ReactNode;
}

export const Page = ({ className, title, headerActions, children }: PropsWithChildren<PageProps>) => (
  <main className={className ? `page ${className}` : 'page'}>
    {title || headerActions ? (
      <div className="page__header">
        {title ? <h1 className="page__title">{title}</h1> : null}
        {headerActions ? <div className="page__header-actions">{headerActions}</div> : null}
      </div>
    ) : null}
    {children}
  </main>
);
