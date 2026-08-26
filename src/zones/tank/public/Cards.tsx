import Link from "next/link";
import { CheckCircle2, Eye, Radio, Signal, Users } from "lucide-react";
import type { TankChannel, TankRoom } from "../contracts";
import { cameraById } from "../fixtures";

export function RoomCard({
  room,
  featured = false,
}: {
  room: TankRoom;
  featured?: boolean;
}) {
  const camera = cameraById(room.featuredCameraId);
  return (
    <Link
      href={`/rooms/${room.slug}`}
      className={`hover:border-primary/40 group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${featured ? "md:col-span-2" : ""}`}
    >
      <div
        className={`relative aspect-video overflow-hidden bg-gradient-to-br ${camera?.accent ?? "from-slate-700 to-slate-950"}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,.18),transparent_22%),radial-gradient(circle_at_75%_60%,rgba(34,211,238,.18),transparent_20%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          {room.live ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-700/90 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-white">
              Offline
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3 text-white">
          <span className="text-sm font-semibold">{camera?.name}</span>
          <Signal className="h-4 w-4 opacity-80" />
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">
          {room.eyebrow}
        </p>
        <h3 className="mt-1 text-xl font-bold tracking-tight group-hover:text-primary">
          {room.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {room.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {room.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export function ChannelCard({ channel }: { channel: TankChannel }) {
  return (
    <Link
      href={`/channels/${channel.slug}`}
      className="hover:border-primary/40 group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <span className="bg-primary/12 grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-primary">
          <Radio className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg font-bold group-hover:text-primary">
              {channel.name}
            </h3>
            {channel.verified && (
              <CheckCircle2 className="h-4 w-4 fill-primary text-primary-foreground" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">{channel.handle}</p>
        </div>
        {channel.live && (
          <span className="ml-auto rounded-full bg-red-600/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-500">
            Live
          </span>
        )}
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {channel.bio}
      </p>
      <div className="mt-4 flex items-center gap-4 border-t border-border/70 pt-4 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {channel.followers.toLocaleString()}
        </span>
        <span className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          {channel.category}
        </span>
      </div>
    </Link>
  );
}
