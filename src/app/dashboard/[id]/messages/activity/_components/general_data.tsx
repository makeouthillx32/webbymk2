"use client";

import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function GeneralMessageDataCard({ chartData }) {
	const data = chartData?.[0] || {};

	return (
		<Card className="mt-10 grid auto-rows-auto px-10 sm:min-w-dvh">
			<div>
				<div className="text-xl font-semibold">
					<Activity className="inline mr-2" />
					General Data
				</div>
				<div className="font-sans text-sm mt-1 text-white/60">
					More insights regarding the messages and their content
				</div>
			</div>
			<div className="grid grid-cols-2 gap-x-3">
				<div>
					<div>
						Messages:{" "}
						<p className="inline text-white/80 font-sans">
							{data.total_messages ?? 0}
						</p>
					</div>
					<div>
						Media Sent:{" "}
						<p className="inline text-white/80 font-sans">
							{data.total_attachments ?? 0}
						</p>
					</div>
				</div>
				<div>
					<div>
						Message Deletions:{" "}
						<p className="inline text-white/80 font-sans">
							{data.message_deletions ?? 0}
						</p>
					</div>
					<div>
						Message Edits:{" "}
						<p className="inline text-white/80 font-sans">
							{data.message_edits ?? 0}
						</p>
					</div>
				</div>
			</div>
		</Card>
	);
}
