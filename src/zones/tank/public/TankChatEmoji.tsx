"use client";

import { useMemo, type ReactNode } from "react";

const SHORTCODE_PATTERN = /:([a-z0-9_-]+):/gi;
const EMOJI_BASE_URL = "https://db.unenter.live/storage/v1/object/public/tank-emoji/32";

export const TANK_EMOJI_NAMES = [
  "adore",
  "afterboom",
  "ah",
  "alien",
  "amazing",
  "angel",
  "anger",
  "angry",
  "aqua",
  "baby",
  "badegg",
  "badsmelly",
  "baffle",
  "batman",
  "beatbrick",
  "beaten",
  "bigsmile",
  "blind",
  "bloody",
  "blowcurrent",
  "boo",
  "brains",
  "bubblegum",
  "bully",
  "burnjossstick",
  "burnt",
  "byebye",
  "chinese",
  "chupachups",
  "clown",
  "cold",
  "confident",
  "confuse",
  "convict",
  "cool",
  "crazy",
  "crazyrabbit",
  "cry",
  "cyclops",
  "daddycool",
  "darthwader",
  "davidblaine",
  "dead",
  "detective",
  "devil",
  "diver",
  "doubt",
  "doze",
  "draw",
  "dribble",
  "drink",
  "drunkard",
  "evilgrin",
  "evolution",
  "exciting",
  "eye",
  "eyesdroped",
  "facemonkey",
  "facepanda",
  "fan",
  "fire",
  "flowerdead",
  "franken",
  "freak",
  "frost",
  "gangs",
  "gear",
  "ghost",
  "girl",
  "go",
  "gourmand",
  "gradgreen",
  "gradred",
  "gradyellow",
  "greedy",
  "grin",
  "haha",
  "handflower",
  "happy",
  "harrypotter",
  "hatched",
  "hatler",
  "hidden",
  "horror",
  "hot",
  "hungry",
  "hypnotized",
  "injured",
  "japan",
  "jason",
  "juggler",
  "kiddy",
  "kiss",
  "kissed",
  "knight",
  "lol",
  "lollipops",
  "love",
  "mad",
  "mahplaylist",
  "matrix",
  "meaw",
  "medic",
  "misdoubt",
  "money",
  "mummy",
  "musician",
  "nerd",
  "ninja",
  "nomnom",
  "nosebleed",
  "nosepick",
  "oddball",
  "ops",
  "party",
  "patient",
  "pirate",
  "pumpkin",
  "punk",
  "question",
  "rap",
  "razz",
  "reading",
  "red",
  "rocknroll",
  "sad",
  "shame",
  "shave",
  "shocked",
  "sick",
  "silent",
  "skull",
  "sleep",
  "smile",
  "smokesgrass",
  "snooty",
  "speaking",
  "spiderman",
  "spy",
  "star",
  "stilldreaming",
  "stink",
  "struggle",
  "stupid",
  "superman",
  "suprised",
  "sure",
  "surrender",
  "sweat",
  "terminator",
  "tire",
  "tomato",
  "tongue",
  "toosad",
  "umbrella",
  "unbelievable",
  "unhappy",
  "unhappyvery",
  "unshaven",
  "vampire",
  "victory",
  "viking",
  "waaaht",
  "waii",
  "watermelon",
  "what",
  "whew",
  "whist",
  "wink",
  "yuush",
  "zedz",
  "zingy",
];

// Pre-constructed mapping of all 170+ emojis with both :name: and :emotion_name: aliases
const staticCatalog = new Map<string, string>();
for (const name of TANK_EMOJI_NAMES) {
  const url = `${EMOJI_BASE_URL}/emotion_${name}.png`;
  staticCatalog.set(name, url);
  staticCatalog.set(`emotion_${name}`, url);
}

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, Image as ImageIcon, ExternalLink, X } from "lucide-react";

export function useTankEmojiCatalog(): Map<string, string> {
  return staticCatalog;
}

const SUPPORTED_EXTS = ["webp", "png", "jpg", "jpeg", "gif"] as const;

export function ChatImageAttachment({ imageId }: { imageId: string }) {
  const [extIdx, setExtIdx] = useState(0);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cleanId = String(imageId).replace(/[^0-9]/g, "");

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentExt = SUPPORTED_EXTS[extIdx] ?? "webp";
  const imageUrl = `https://db.unenter.live/storage/v1/object/public/tank-chat-attachments/attachments/${cleanId}.${currentExt}`;

  // Close on Escape key press and prevent background page scrolling
  useEffect(() => {
    if (!zoom) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoom]);

  if (error) {
    return (
      <span
        title="This image has passed its 3-hour ephemeral lifespan and was purged."
        className="inline-flex items-center gap-1 my-0.5 rounded border border-orange-500/30 bg-orange-950/40 px-1.5 py-0.5 text-[9px] font-mono font-bold text-orange-400 select-none shadow-sm"
      >
        <Clock className="h-2.5 w-2.5" />
        <span>[Image Expired]</span>
      </span>
    );
  }

  const zoomModal = zoom && mounted && typeof document !== "undefined" ? (
    createPortal(
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setZoom(false);
        }}
        className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md cursor-zoom-out animate-in fade-in duration-150"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-xl border border-cyan-500/60 bg-[#0d0f14] p-3 shadow-2xl cursor-default"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 px-1 text-xs font-mono text-cyan-400">
            <span className="flex items-center gap-1.5 font-bold">
              <ImageIcon className="h-4 w-4" />
              <span>ATTACHMENT #{cleanId}</span>
              <span className="text-[10px] text-slate-400 font-normal">(Ephemeral 3h)</span>
            </span>
            <div className="flex items-center gap-2">
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-slate-400 hover:text-white transition"
                title="Open full resolution in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setZoom(false)}
                className="rounded p-1 text-slate-400 hover:text-red-400 transition"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img
            src={imageUrl}
            alt={`Fullscreen ${cleanId}`}
            className="max-h-[80vh] max-w-[88vw] object-contain rounded-lg mx-auto shadow-inner"
          />
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      <span className="inline-block my-1 align-middle">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setZoom(true);
          }}
          className="group relative block overflow-hidden rounded border border-cyan-500/40 bg-black/70 shadow-md transition hover:border-cyan-400 hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
        >
          <img
            src={imageUrl}
            alt={`Attachment ${cleanId}`}
            loading="lazy"
            onError={() => {
              if (extIdx < SUPPORTED_EXTS.length - 1) {
                setExtIdx((prev) => prev + 1);
              } else {
                setError(true);
              }
            }}
            className="max-h-40 max-w-[220px] object-cover rounded pointer-events-none"
          />
          <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1.5 py-0.5 text-[8px] font-mono text-cyan-300 opacity-90 group-hover:opacity-100 transition shadow-sm border border-cyan-500/30">
            🔍 Zoom (3h)
          </span>
        </button>
      </span>

      {zoomModal}
    </>
  );
}

export function ChatGifAttachment({ gifId }: { gifId: string }) {
  const [zoom, setZoom] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clean = gifId.trim();
  const isDirectUrl = clean.startsWith("http://") || clean.startsWith("https://");
  const cleanId = clean.replace(/[^a-zA-Z0-9_-]/g, "");

  const gifUrl = isDirectUrl
    ? clean
    : useFallback
    ? `https://media.giphy.com/media/${cleanId}/200.gif`
    : `https://media.giphy.com/media/${cleanId}/200.webp`;

  const fullUrl = isDirectUrl
    ? clean
    : `https://media.giphy.com/media/${cleanId}/giphy.gif`;

  // Close on Escape key press and prevent background page scrolling
  useEffect(() => {
    if (!zoom) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoom]);

  const zoomModal = zoom && mounted && typeof document !== "undefined" ? (
    createPortal(
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setZoom(false);
        }}
        className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md cursor-zoom-out animate-in fade-in duration-150"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-purple-500/60 bg-[#121019] p-3 shadow-2xl cursor-default"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 px-1 text-xs font-mono text-purple-400">
            <span className="flex items-center gap-1.5 font-bold">
              <span className="rounded bg-gradient-to-r from-purple-600 to-pink-500 px-1.5 py-0.2 text-[9px] text-white">
                GIF
              </span>
              <span>GIPHY ANIMATION</span>
            </span>
            <div className="flex items-center gap-2">
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-slate-400 hover:text-white transition"
                title="Open full resolution in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setZoom(false)}
                className="rounded p-1 text-slate-400 hover:text-red-400 transition"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img
            src={fullUrl}
            alt="Fullscreen GIF"
            className="max-h-[80vh] max-w-[88vw] object-contain rounded-lg mx-auto shadow-inner"
          />
          <div className="mt-2 flex items-center justify-end px-1 text-[9px] font-mono text-purple-400/80">
            Powered by GIPHY
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      <span className="inline-block my-1 align-middle">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setZoom(true);
          }}
          className="group relative block overflow-hidden rounded-lg border border-purple-500/50 bg-black/70 shadow-md transition hover:border-purple-400 hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
        >
          <img
            src={gifUrl}
            alt="GIPHY GIF"
            loading="lazy"
            onError={() => {
              if (!useFallback) setUseFallback(true);
            }}
            className="max-h-44 max-w-[240px] object-cover rounded pointer-events-none"
          />
          <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/85 px-1.5 py-0.5 text-[8px] font-mono text-purple-300 opacity-90 group-hover:opacity-100 transition shadow-sm border border-purple-500/40">
            <span>GIF</span>
            <span className="text-[7px] text-slate-400 font-bold">GIPHY</span>
          </div>
        </button>
      </span>

      {zoomModal}
    </>
  );
}

const URL_OR_EMOJI_PATTERN =
  /(https?:\/\/[^\s]+)|:([a-z0-9_-]+):|(@[a-zA-Z0-9_.-]+(?:\s+[a-zA-Z0-9_.-]+)?)|\[image(?::)?(\d+)\]|\[gif:(https?:\/\/[^\s\]]+|[a-zA-Z0-9_-]+)\]/gi;

export function TankChatBody({
  body,
  text,
}: {
  body?: string;
  text?: string;
}) {
  const content = (body ?? text ?? "").toString();
  const catalog = staticCatalog;

  const parts = useMemo(() => {
    if (!content) return [];
    const elements: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    URL_OR_EMOJI_PATTERN.lastIndex = 0;

    while ((match = URL_OR_EMOJI_PATTERN.exec(content))) {
      const fullMatch = match[0];
      const urlMatch = match[1];
      const emojiMatch = match[2];
      const mentionMatch = match[3];
      const imageMatch = match[4];
      const gifMatch = match[5];

      if (match.index > lastIndex) {
        elements.push(content.slice(lastIndex, match.index));
      }

      if (urlMatch) {
        elements.push(
          <a
            key={`url-${match.index}`}
            href={urlMatch}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline font-black transition"
            onClick={(e) => e.stopPropagation()}
          >
            {urlMatch}
          </a>,
        );
      } else if (emojiMatch) {
        const shortcode = emojiMatch.toLowerCase();
        const url = catalog.get(shortcode);
        if (url) {
          elements.push(
            <img
              key={`${shortcode}-${match.index}`}
              src={url}
              alt={`:${shortcode}:`}
              className="tank-chat-emoji mx-0.5 inline-block object-contain drop-shadow-sm transition hover:scale-125"
              title={`:${shortcode}:`}
              loading="lazy"
            />,
          );
        } else {
          elements.push(fullMatch);
        }
      } else if (mentionMatch) {
        elements.push(
          <span
            key={`mention-${match.index}`}
            className="font-bold text-purple-300 bg-purple-950/60 px-1 py-0.2 rounded border border-purple-500/40 shadow-sm"
          >
            {mentionMatch}
          </span>,
        );
      } else if (imageMatch) {
        elements.push(
          <ChatImageAttachment key={`img-${match.index}`} imageId={imageMatch} />,
        );
      } else if (gifMatch) {
        elements.push(
          <ChatGifAttachment key={`gif-${match.index}`} gifId={gifMatch} />,
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < content.length) {
      elements.push(content.slice(lastIndex));
    }

    return elements;
  }, [content, catalog]);

  if (!content) return null;
  return <>{parts}</>;
}
