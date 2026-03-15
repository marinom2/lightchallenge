"use client";

import Link from "next/link";

type Crumb = { label: string; href?: string };

export default function AdminPageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="admin-page-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={i}>
              {i > 0 && <span className="admin-breadcrumb-sep">/</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="admin-breadcrumb-link">
                  {crumb.label}
                </Link>
              ) : (
                <span className="admin-breadcrumb-current">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="admin-page-header__row">
        <div>
          <h1 className="admin-page-title">{title}</h1>
          {description && (
            <p className="admin-page-desc">{description}</p>
          )}
        </div>
        {actions && <div className="admin-page-actions">{actions}</div>}
      </div>
    </div>
  );
}
