// app/dashboard/[id]/messages/_components/_message-charts/last_24hrs.tsx
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

export default function Last24h({ chartData }) {
	// Ensure array exists
	const dataArray = Array.isArray(chartData) ? chartData : [];

	// Chart data should be array of items with { hour, amount }
	const ArrayChartData = Array.isArray(dataArray[0]) ? dataArray[0] : dataArray;

	// Helper to get amount safely
	const getAmount = (hourKey: string) => {
		const idx = ArrayChartData.findIndex((item) => item.hour === hourKey);
		return idx >= 0 && ArrayChartData[idx]?.amount != null
			? ArrayChartData[idx].amount
			: 0;
	};

	// Calculate current and previous keys
	const now = new Date();
	const startingHour = now.getUTCHours().toString().padStart(2, "0");
	const previousHour = new Date(now.getTime() - 60 * 60 * 1000)
		.getUTCHours()
		.toString()
		.padStart(2, "0");

	const currentAmount = getAmount(startingHour);
	const previousAmount = getAmount(previousHour);
	const difference = currentAmount - previousAmount;

	const chartConfig: ChartConfig = {
		hour: { label: "hour", color: "#03d5ff" },
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Last 24 hours (UTC)</CardTitle>
				<CardDescription>
					Showing total messages for the last 24 hours
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig}>
					<AreaChart
						accessibilityLayer
						data={ArrayChartData}
						margin={{ left: 12, right: 12 }}
					>
						<CartesianGrid vertical />
						<XAxis
							dataKey="hour"
							type="number"
							domain={[0, 24]}
							ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
							tickFormatter={(v) => String(v).padStart(2, "0")}
							tickLine
							axisLine
								tickMargin={5}
						/> 
						<ChartTooltip
							cursor
							content={<ChartTooltipContent indicator="dot" hideLabel />}
						/>

						<Area
							dataKey="amount"
							type="linear"
							fill="var(--color-hour)"
							fillOpacity={0.4}
							stroke="var(--color-hour)"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
			<CardFooter>
				<div className="flex w-full items-start gap-2 text-sm">
					<div className="grid gap-2">
						<div className="flex items-center gap-2 font-medium leading-none">
							{difference > 0 ? (
								<div className="text-green-400">
									+{difference} than previous hour <TrendingUp className="inline h-4 w-4" />
								</div>
							) : difference < 0 ? (
								<div className="text-red-400">
									{difference} than previous hour <TrendingDown className="inline h-4 w-4" />
								</div>
							) : (
								<div className="text-gray-400">+0 than previous hour</div>
							)}
						</div>
					</div>
				</div>
			</CardFooter>
		</Card>
	);
}
