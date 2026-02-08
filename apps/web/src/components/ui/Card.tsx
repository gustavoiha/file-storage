import type { PropsWithChildren } from 'react';
import '@/styles/ui.css';

interface CardProps {
  title?: string;
}

export const Card = ({ title, children }: PropsWithChildren<CardProps>) => (
  <section className="ui-card">
    {title ? <h2 className="ui-card__title">{title}</h2> : null}
    {children}
  </section>
);
