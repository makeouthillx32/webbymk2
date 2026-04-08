"use client";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
	amount: {
		label: "amount",
		color: "#03d5ff",
	},
} satisfies ChartConfig;

export default function Last7d({ chartData }) {
	let ArrayChartData = Array(chartData)[0];

	let today = new Date();
	let yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

	let todayStr = `${(today.getUTCMonth() + 1).toString().padStart(2, "0")}-${today.getUTCDate().toString().padStart(2, "0")}`;
	let yesterdayStr = `${(yesterday.getUTCMonth() + 1).toString().padStart(2, "0")}-${yesterday.getUTCDate().toString().padStart(2, "0")}`;

	let todayEntry = ArrayChartData.find((item) => item.date === todayStr);
	let yesterdayEntry = ArrayChartData.find((item) => item.date === yesterdayStr);

	let currentAmount = todayEntry?.amount ?? 0;
	let previousAmount = yesterdayEntry?.amount ?? 0;

	let difference = currentAmount - previousAmount;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Last 7 days</CardTitle>
				<CardDescription>Showing total messages for the last 7 days</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig}>
					<AreaChart data={chartData} margin={{ left: 12, right: 12 }}>
						<CartesianGrid vertical={false} />
						<XAxis
							dataKey="date"
							tickLine
							axisLine
							tickMargin={8}
							tickFormatter={(v) => v.slice(0, 5)}
						/>
						<ChartTooltip cursor content={<ChartTooltipContent indicator="dot" hideLabel />} />
						<Area
							dataKey="amount"
							type="linear"
							fill="var(--color-amount)"
							fillOpacity={0.4}
							stroke="var(--color-amount)"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
			<CardFooter>
				<div className="text-sm">
					{difference > 0 ? (
						<span className="text-green-400">
							+{difference} than yesterday <TrendingUp className="inline h-4 w-4" />
						</span>
					) : difference < 0 ? (
						<span className="text-red-400">
							{difference} than yesterday <TrendingDown className="inline h-4 w-4" />
						</span>
					) : (
						<span className="text-gray-400">No change from yesterday</span>
					)}
				</div>
			</CardFooter>
		</Card>
	);
}
