// src/data/fetchHomeContent.ts
// Server-side helper — reads home page section content from homepage_content table.

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

// ── Types ──────────────────────────────────────────────────────────────────────

export type KickContent = {
  title: string;
  description: string;
  streamButton: string;
  didYouKnowTitle: string;
  didYouKnowItems: string[];
};

export type DiscordContent = {
  title: string;
  paragraph: string;
  button: string;
  extraTitle: string;
  points: string[];
};

export type PickmeContent = {
  pickMe: string;
  noPickMe: string;
  repostText: string;
};

export type HomeContent = {
  slogan: string;
  kick: KickContent;
  discord: DiscordContent;
  pickme: PickmeContent;
};

// ── Defaults (fallback if DB is empty) ────────────────────────────────────────

const DEFAULTS: HomeContent = {
  slogan: 'Check out my latest Vid',
  kick: {
    title: 'UNENTER',
    description: "I will let you witness my coding skills in real time.",
    streamButton: 'Watch me on KICK.com',
    didYouKnowTitle: 'Did you know...',
    didYouKnowItems: [],
  },
  discord: {
    title: 'Join Our Discord',
    paragraph: 'Be part of an amazing community on Discord!',
    button: 'Join the Community',
    extraTitle: 'Why Join Us?',
    points: [],
  },
  pickme: {
    pickMe: 'Pick me!',
    noPickMe: 'No, pick me!',
    repostText: 'REPOST YOURSELF TO GROW!',
  },
};

// ── Fetch ──────────────────────────────────────────────────────────────────────

export async function fetchHomeContent(locale: string = 'en'): Promise<HomeContent> {
  const supabase = await createClient();
  const lang = (locale === 'de' ? 'de' : 'en') as 'en' | 'de';

  const { data, error } = await supabase
    .from('homepage_content')
    .select('key, json')
    .in('key', ['section_slogan', 'section_kick', 'section_discord', 'section_pickme']);

  if (error || !data) return DEFAULTS;

  const byKey = Object.fromEntries(data.map((row) => [row.key, row.json]));

  const slogan: string =
    byKey.section_slogan?.[lang] ??
    byKey.section_slogan?.['en'] ??
    DEFAULTS.slogan;

  const kickRaw = byKey.section_kick?.[lang] ?? byKey.section_kick?.['en'] ?? {};
  const kick: KickContent = {
    title:           kickRaw.title           ?? DEFAULTS.kick.title,
    description:     kickRaw.description     ?? DEFAULTS.kick.description,
    streamButton:    kickRaw.streamButton    ?? DEFAULTS.kick.streamButton,
    didYouKnowTitle: kickRaw.didYouKnowTitle ?? DEFAULTS.kick.didYouKnowTitle,
    didYouKnowItems: kickRaw.didYouKnowItems ?? DEFAULTS.kick.didYouKnowItems,
  };

  const discordRaw = byKey.section_discord?.[lang] ?? byKey.section_discord?.['en'] ?? {};
  const discord: DiscordContent = {
    title:      discordRaw.title      ?? DEFAULTS.discord.title,
    paragraph:  discordRaw.paragraph  ?? DEFAULTS.discord.paragraph,
    button:     discordRaw.button     ?? DEFAULTS.discord.button,
    extraTitle: discordRaw.extraTitle ?? DEFAULTS.discord.extraTitle,
    points:     discordRaw.points     ?? DEFAULTS.discord.points,
  };

  const pickmeRaw = byKey.section_pickme?.[lang] ?? byKey.section_pickme?.['en'] ?? {};
  const pickme: PickmeContent = {
    pickMe:     pickmeRaw.pickMe     ?? DEFAULTS.pickme.pickMe,
    noPickMe:   pickmeRaw.noPickMe   ?? DEFAULTS.pickme.noPickMe,
    repostText: pickmeRaw.repostText ?? DEFAULTS.pickme.repostText,
  };

  return { slogan, kick, discord, pickme };
}
