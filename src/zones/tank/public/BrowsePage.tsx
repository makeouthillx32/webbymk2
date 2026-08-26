import { SlidersHorizontal } from "lucide-react";
import { channels, rooms } from "../fixtures";
import { ChannelCard, RoomCard } from "./Cards";
import { CameraDirectoryClient } from "./CameraDirectoryClient";
import { PublicShell } from "./PublicShell";

export default function BrowsePage() {
  return (
    <PublicShell>
      <div className="container py-10 md:py-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-primary">
              Explore Tank
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">
              Browse live rooms
            </h1>
            <p className="mt-2 text-muted-foreground">
              Every public room, camera collection, and channel in one place.
            </p>
          </div>
          <button className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>
        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {[
            "All",
            "Live now",
            "Animals",
            "IRL",
            "Science & Tech",
            "Ambient",
          ].map((item, index) => (
            <button
              key={item}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${index === 0 ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
        <div className="mt-14 border-t border-border pt-10">
          <h2 className="text-2xl font-bold">Live camera feeds</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated automatically from valid receiver connections.
          </p>
          <div className="mt-5">
            <CameraDirectoryClient compact />
          </div>
        </div>
        <div className="mt-14 border-t border-border pt-10">
          <h2 className="text-2xl font-bold">Channels</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {channels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
