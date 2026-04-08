import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TopProductsSkeleton() {
  return (
    <div className="rounded-[calc(var(--radius)*1.25)] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]">
      <h2 className="px-4 py-6 text-2xl font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))] md:px-6 xl:px-9">
        Top Products
      </h2>

      <Table>
        <TableHeader>
          <TableRow className="border-t border-[hsl(var(--border))] text-base [&>th]:h-auto [&>th]:py-3 sm:[&>th]:py-4.5">
            <TableHead className="min-w-[120px]">Product Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Sold</TableHead>
            <TableHead>Profit</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell colSpan={100}>
                <Skeleton className="h-8 bg-[hsl(var(--muted))]" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}