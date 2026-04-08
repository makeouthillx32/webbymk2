import { TrashIcon } from "@/assets/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { getInvoiceTableData } from "./fetch";
import { DownloadIcon, PreviewIcon } from "./icons";

export async function InvoiceTable() {
  const data = await getInvoiceTableData();

  return (
    <div className="rounded-[calc(var(--radius)*1.25)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-sm)] dark:border-[hsl(var(--border))] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)] sm:p-7.5">
      <Table>
        <TableHeader>
          <TableRow className="border-none bg-[hsl(var(--muted))] dark:bg-[hsl(var(--secondary))] [&>th]:py-4 [&>th]:text-base [&>th]:text-[hsl(var(--foreground))] [&>th]:dark:text-[hsl(var(--foreground))]">
            <TableHead className="min-w-[155px] xl:pl-7.5">Package</TableHead>
            <TableHead>Invoice Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right xl:pr-7.5">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.map((item, index) => (
            <TableRow key={index} className="border-[hsl(var(--border))] dark:border-[hsl(var(--border))]">
              <TableCell className="min-w-[155px] xl:pl-7.5">
                <h5 className="text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">{item.name}</h5>
                <p className="mt-[3px] text-body-sm font-medium">
                  ${item.price}
                </p>
              </TableCell>

              <TableCell>
                <p className="text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
                  {dayjs(item.date).format("MMM DD, YYYY")}
                </p>
              </TableCell>

              <TableCell>
                <div
                  className={cn(
                    "max-w-fit rounded-full px-3.5 py-1 text-sm font-medium",
                    {
                      "bg-[hsl(var(--chart-2))]/[0.08] text-[hsl(var(--chart-2))]":
                        item.status === "Paid",
                      "bg-[hsl(var(--destructive))]/[0.08] text-[hsl(var(--destructive))]":
                        item.status === "Unpaid",
                      "bg-[hsl(var(--chart-4))]/[0.08] text-[hsl(var(--chart-4))]":
                        item.status === "Pending",
                    },
                  )}
                >
                  {item.status}
                </div>
              </TableCell>

              <TableCell className="xl:pr-7.5">
                <div className="flex items-center justify-end gap-x-3.5">
                  <button className="hover:text-[hsl(var(--sidebar-primary))]">
                    <span className="sr-only">View Invoice</span>
                    <PreviewIcon />
                  </button>

                  <button className="hover:text-[hsl(var(--sidebar-primary))]">
                    <span className="sr-only">Delete Invoice</span>
                    <TrashIcon />
                  </button>

                  <button className="hover:text-[hsl(var(--sidebar-primary))]">
                    <span className="sr-only">Download Invoice</span>
                    <DownloadIcon />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}