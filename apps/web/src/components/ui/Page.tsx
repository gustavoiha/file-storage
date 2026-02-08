import type { PropsWithChildren } from 'react';
import '@/styles/layout.css';

interface PageProps {
  title: string;
}

export const Page = ({ title, children }: PropsWithChildren<PageProps>) => (
  <main className="page">
    <h1 className="page__title">{title}</h1>
    {children}
  </main>
);
