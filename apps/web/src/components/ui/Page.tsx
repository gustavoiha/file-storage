import type { PropsWithChildren, ReactNode, Ref } from 'react';
import '@/styles/layout.css';

interface PageProps {
  className?: string;
  title?: string;
  headerActions?: ReactNode;
  /**
   * Makes the title a focus target (`tabIndex={-1}`): the fallback for a page that moves focus after its content
   * changes and has no control to move it to.
   */
  titleRef?: Ref<HTMLHeadingElement>;
}

export const Page = ({ className, title, headerActions, titleRef, children }: PropsWithChildren<PageProps>) => (
  <main className={className ? `page ${className}` : 'page'}>
    {title || headerActions ? (
      <div className="page__header">
        {title ? (
          <h1 ref={titleRef} className="page__title" tabIndex={titleRef ? -1 : undefined}>
            {title}
          </h1>
        ) : null}
        {headerActions ? <div className="page__header-actions">{headerActions}</div> : null}
      </div>
    ) : null}
    {children}
  </main>
);
