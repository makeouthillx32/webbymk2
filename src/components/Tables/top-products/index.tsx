import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Image from "next/image";
import { getTopProducts } from "../fetch";

export async function TopProducts() {
  const data = await getTopProducts();

  return (
    <div className="rounded-[calc(var(--radius)*1.25)] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]">
      <div className="px-6 py-4 sm:px-7 sm:py-5 xl:px-8.5">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
          Top Products
        </h2>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-t border-[hsl(var(--border))] text-base [&>th]:h-auto [&>th]:py-3 sm:[&>th]:py-4.5">
            <TableHead className="min-w-[120px] pl-5 sm:pl-6 xl:pl-7.5">
              Product Name
            </TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Sold</TableHead>
            <TableHead className="pr-5 text-right sm:pr-6 xl:pr-7.5">
              Profit
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.map((product) => (
            <TableRow
              className="text-base font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]"
              key={product.name + product.profit}
            >
              <TableCell className="flex min-w-fit items-center gap-3 pl-5 sm:pl-6 xl:pl-7.5">
                <Image
                  src={product.image}
                  className="aspect-[6/5] w-15 rounded-[calc(var(--radius)*0.625)] object-cover"
                  width={60}
                  height={50}
                  alt={"Image for product " + product.name}
                  role="presentation"
                />
                <div>{product.name}</div>
              </TableCell>

              <TableCell>{product.category}</TableCell>

              <TableCell>${product.price}</TableCell>

              <TableCell>{product.sold}</TableCell>

              <TableCell className="pr-5 text-right text-[hsl(var(--chart-2))] sm:pr-6 xl:pr-7.5">
                ${product.profit}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}