"use client";
// components/dashboard/DataTable.tsx
// Small generic table over the shadcn table primitives. Column definitions are
// data, so a CRUD screen declares its columns once instead of hand-writing
// <thead>/<tbody> markup that slowly diverges from every other screen.
//
//   <DataTable
//     rows={posts}
//     getRowId={(post) => post.id}
//     columns={[{ key: "title", header: "Title", cell: (post) => post.slug }]}
//   />

import * as React from "react";
import { cn } from "@/utils/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "./EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Applied to both the header and body cells. */
  className?: string;
  /** Hide below md — for columns that are nice-to-have on wide screens. */
  hideOnMobile?: boolean;
}

const ALIGN: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  loading = false,
  skeletonRows = 5,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowClick,
  className,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  if (!loading && rows.length === 0) {
    return (
      <div className={cn("rounded-[var(--radius)] border border-[hsl(var(--border))]", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))]",
        className,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]",
                  ALIGN[column.align ?? "left"],
                  column.hideOnMobile && "hidden md:table-cell",
                  column.className,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(column.hideOnMobile && "hidden md:table-cell")}
                    >
                      <span className="block h-4 w-full max-w-[180px] animate-pulse rounded bg-[hsl(var(--muted))]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-[hsl(var(--muted))]/40",
                  )}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        ALIGN[column.align ?? "left"],
                        column.hideOnMobile && "hidden md:table-cell",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
