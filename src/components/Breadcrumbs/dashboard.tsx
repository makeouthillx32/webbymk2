"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

interface BreadcrumbProps {
  pageName: string;
}

const Breadcrumb = ({ pageName }: BreadcrumbProps) => {
  const { id } = useParams() as { id: string };
  const dashboardUrl = `/dashboard/${id}`;

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 
        className="text-[26px] font-bold leading-[30px]" 
        style={{ color: 'hsl(var(--foreground))' }}
      >
        {pageName}
      </h2>

      <nav>
        <ol className="flex items-center gap-2">
          <li>
            <Link 
              className="font-medium transition-colors hover:opacity-80" 
              href={dashboardUrl}
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              Dashboard /
            </Link>
          </li>
          <li 
            className="font-medium" 
            style={{ color: 'hsl(var(--primary))' }}
          >
            {pageName}
          </li>
        </ol>
      </nav>
    </div>
  );
};

export default Breadcrumb;