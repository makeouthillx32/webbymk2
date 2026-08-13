import { notFound } from "next/navigation";
import { Bell, CheckCircle2, Radio, Users } from "lucide-react";
import { channelBySlug, rooms } from "../fixtures";
import { RoomCard } from "./Cards";
import { PublicShell } from "./PublicShell";

export default function ChannelPage({ slug }: { slug: string }) {
  const channel = channelBySlug(slug);
  if (!channel) notFound();
  const channelRooms = rooms.filter((room) => room.channelId === channel.id);
  return (
    <PublicShell>
      <section className="from-primary/15 border-b border-border bg-gradient-to-br via-background to-background">
        <div className="container py-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-end">
            <span className="border-primary/20 grid h-24 w-24 place-items-center rounded-3xl border bg-primary text-primary-foreground shadow-xl">
              <Radio className="h-10 w-10" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-black tracking-tight">
                  {channel.name}
                </h1>
                {channel.verified && (
                  <CheckCircle2 className="h-5 w-5 fill-primary text-primary-foreground" />
                )}
              </div>
              <p className="mt-1 font-semibold text-primary">
                {channel.handle}
              </p>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                {channel.bio}
              </p>
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" />
                {channel.followers.toLocaleString()} followers ·{" "}
                {channel.category}
              </p>
            </div>
            <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
              <Bell className="h-4 w-4" />
              Follow
            </button>
          </div>
        </div>
      </section>
      <section className="container py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Rooms</h2>
          {channel.live && (
            <span className="rounded-full bg-red-600/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-500">
              Live now
            </span>
          )}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {channelRooms.length ? (
            channelRooms.map((room) => <RoomCard key={room.id} room={room} />)
          ) : (
            <p className="text-muted-foreground">
              This channel has no public rooms yet.
            </p>
          )}
        </div>
      </section>
    </PublicShell>
  );
}
