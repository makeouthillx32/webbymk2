"use client";

import { compactFormat } from "@/lib/format-number";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

type PropsType = {
  data: { name: string; amount: number }[];
};

const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export function DonutChart({ data }: PropsType) {
  // Use your Tailwind design system colors
  const tailwindColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))", 
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))"
  ];

  const chartOptions: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "var(--font-sans)", // Use your font variable
      background: "transparent",
    },
    colors: tailwindColors,
    labels: data.map((item) => item.name),
    legend: {
      show: true,
      position: "bottom",
      fontFamily: "var(--font-sans)",
      fontSize: "14px",
      fontWeight: 500,
      labels: {
        colors: "hsl(var(--foreground))", // Use your text color
        useSeriesColors: false
      },
      itemMargin: {
        horizontal: 10,
        vertical: 5,
      },
      formatter: (legendName, opts) => {
        const { seriesPercent } = opts.w.globals;
        // Round to whole number and remove decimals
        const cleanPercent = Math.round(seriesPercent[opts.seriesIndex]);
        return `${legendName}: ${cleanPercent}%`;
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "80%",
          background: "transparent",
          labels: {
            show: true,
            total: {
              show: true,
              showAlways: true,
              label: "Visitors",
              fontSize: "16px",
              fontWeight: "400",
              color: "hsl(var(--muted-foreground))", // Use your muted text color
              fontFamily: "var(--font-sans)",
            },
            value: {
              show: true,
              fontSize: "28px",
              fontWeight: "bold",
              color: "hsl(var(--foreground))", // Use your primary text color
              fontFamily: "var(--font-sans)",
              formatter: (val) => compactFormat(+val),
            },
          },
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      width: 2,
      colors: ["hsl(var(--background))"] // Use your background color for stroke
    },
    tooltip: {
      theme: "dark", // Will use CSS variables
      style: {
        fontSize: "14px",
        fontFamily: "var(--font-sans)",
      },
      y: {
        formatter: (value) => `${value} visitors`
      }
    },
    responsive: [
      {
        breakpoint: 2600,
        options: {
          chart: {
            width: 415,
          },
        },
      },
      {
        breakpoint: 640,
        options: {
          chart: {
            width: "100%",
          },
        },
      },
      {
        breakpoint: 370,
        options: {
          chart: {
            width: 260,
          },
        },
      },
    ],
  };

  return (
    <Chart
      options={chartOptions}
      series={data.map((item) => item.amount)}
      type="donut"
    />
  );
}