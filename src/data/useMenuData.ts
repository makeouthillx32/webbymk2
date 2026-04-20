// src/data/useMenuData.ts
// Fetches landing header nav items from Supabase.
// Falls back to hardcoded defaults if the DB is unavailable.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Menu } from '@/types';

type NavRow = {
  id: string;
  translations: Record<string, string>;
  path: string | null;
  submenu_type: string | null;
  position: number;
  is_active: boolean;
  open_in_new_tab: boolean;
};

// ── Fallback (shown on first render / if DB fails) ────────────────────────────
const FALLBACK: Menu[] = [
  { title: 'Services', newTab: false },
  { title: 'About Me', path: '/about',   newTab: false },
  { title: 'Jobs',     path: '/jobs',    newTab: false },
  { title: 'Contact',  path: '/contact', newTab: false },
];

// ── Hook ──────────────────────────────────────────────────────────────────────
const useMenuData = (locale: 'en' | 'de' = 'en'): Menu[] => {
  const [items, setItems] = useState<Menu[]>(FALLBACK);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('landing_nav_items')
      .select('id, translations, path, submenu_type, position, is_active, open_in_new_tab')
      .eq('is_active', true)
      .order('position', { ascending: true })
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;

        const rows = data as NavRow[];
        setItems(
          rows.map((row) => ({
            title:   row.translations[locale] ?? row.translations['en'] ?? '',
            path:    row.path ?? undefined,
            newTab:  row.open_in_new_tab,
            // Keep submenu_type so header can detect the services dropdown
            ...(row.submenu_type ? { submenuType: row.submenu_type } : {}),
          })),
        );
      });
  }, [locale]);

  return items;
};

export default useMenuData;
