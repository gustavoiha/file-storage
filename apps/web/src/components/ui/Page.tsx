import type { PropsWithChildren, ReactNode } from 'react';
import '@/styles/layout.css';

interface PageProps {
  title: string;
  headerActions?: ReactNode;
}

export const Page = ({ title, headerActions, children }: PropsWithChildren<PageProps>) => (
  <main className="page">
    <div className="page__header">
      <h1 className="page__title">{title}</h1>
      {headerActions ? <div className="page__header-actions">{headerActions}</div> : null}
    </div>
    {children}
  </main>
);
