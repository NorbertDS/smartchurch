import { PropsWithChildren, useEffect } from 'react';

type Props = {
  title: string;
  description?: string;
  breadcrumb?: { label: string; href: string }[];
};

export default function SectionLayout({ title, description, breadcrumb, children }: PropsWithChildren<Props>) {
  useEffect(() => {
    if (title) document.title = `FaithConnect · ${title}`;
    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', description);
    }
  }, [title, description]);

  return (
    <div className="container">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="flex items-center justify-between mb-3" aria-label="section header">
        <h1 className="text-xl font-semibold text-faith-blue">{title}</h1>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="breadcrumb" className="text-sm">
            <ol className="flex items-center gap-2">
              {breadcrumb.map((b, i) => (
                <li key={`${b.href}-${i}`}>
                  <a href={b.href} className="text-blue-600 underline">{b.label}</a>
                  {i < breadcrumb.length - 1 ? <span className="mx-1 text-gray-600">/</span> : null}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </header>
      {description && (<p className="text-sm text-gray-700 mb-2" aria-live="polite">{description}</p>)}
      <main id="main" role="main" className="space-y-3">
        {children}
      </main>
    </div>
  );
}
