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

export default function Last4Weeks({ chartData }) {
	const chartConfig = {
		amount: {
			label: "amount",
			color: "#03d5ff",
		},
	} satisfies ChartConfig;

	let ArrayChartData = Array(chartData)[0];

	let startingDate = new Date();
	let startingFactor = startingDate.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});

	let previousDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	let previousFactor = previousDate.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});

	let current = ArrayChartData.find((item) => item.factor === startingFactor);
	let previous = ArrayChartData.find((item) => item.factor === previousFactor);

	let currentAmount = current?.amount ?? 0;
	let previousAmount = previous?.amount ?? 0;
	let difference = currentAmount - previousAmount;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Last 4 weeks</CardTitle>
				<CardDescription>Showing total messages for the last 4 weeks</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig}>
					<AreaChart data={chartData} margin={{ left: 15, right: 15 }}>
						<CartesianGrid vertical={true} />
						<XAxis
							dataKey="factor"
							tickLine
							axisLine
							tickMargin={0}
							tickFormatter={(v) => v.slice(0, 6)}
							interval={0}
							tick={{ angle: -30, fontSize: 10, dx: -5, dy: 5 }}
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
							+{difference} than previous week <TrendingUp className="inline h-4 w-4" />
						</span>
					) : difference < 0 ? (
						<span className="text-red-400">
							{difference} than previous week <TrendingDown className="inline h-4 w-4" />
						</span>
					) : (
						<span className="text-gray-400">No change from previous week</span>
					)}
				</div>
			</CardFooter>
		</Card>
	);
}
