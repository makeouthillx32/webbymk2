// themes/index.ts
import type { Theme } from '@/types/theme';
import { createBrowserClient } from '@supabase/ssr';
import defaultTheme from './default';
import monochromeTheme from './monochrome';
import vintageTheme from './vintage';
import sharpTheme from './sharp';

// Bundled fallback themes — always available even when DB is unreachable
const LOCAL_THEMES: Theme[] = [defaultTheme, monochromeTheme, vintageTheme, sharpTheme];
const LOCAL_THEME_MAP: Record<string, Theme> = Object.fromEntries(
  LOCAL_THEMES.map(t => [t.id, t])
);

// Use NEXT_PUBLIC_SUPABASE_URL_BROWSER when available — this is the browser-accessible
// URL (e.g. http://localhost:8001). NEXT_PUBLIC_SUPABASE_URL may point to the
// Docker-internal hostname (kong:8000) which browsers cannot resolve.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Create Supabase client
const supabase = createBrowserClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Cache for themes to avoid repeated database calls
let themesCache: Theme[] | null = null;
let themeMapCache: Record<string, Theme> | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Error backoff — after a DB failure, wait before retrying so mobile browsers
// are not hammered with failing requests (Safari iOS will kill the page).
let fetchErrorAt: number = 0;
const ERROR_BACKOFF = 30 * 1000; // 30 seconds

// Fetch themes from database
export async function fetchThemes(): Promise<Theme[]> {
  // Return success-cached themes
  if (themesCache && Date.now() < cacheExpiry) {
    return themesCache;
  }

  // Return local fallbacks during the error backoff window
  if (fetchErrorAt && Date.now() - fetchErrorAt < ERROR_BACKOFF) {
    console.warn('⚠️ DB in backoff window — using local theme fallbacks');
    return LOCAL_THEMES;
  }

  try {
    console.log('🎨 Fetching themes from database...');

    const { data, error } = await supabase
      .from('themes')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching themes:', error);
      throw new Error(`Failed to fetch themes: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.warn('⚠️ No themes found in database — using local fallbacks');
      return LOCAL_THEMES;
    }

    // Transform database rows to Theme objects
    const themes: Theme[] = data.map(row => {
      try {
        const themeData = row.theme_data as Theme;
        return {
          ...themeData,
          id: row.id,
          name: row.name,
          description: row.description,
          previewColor: row.preview_color,
        };
      } catch (parseError) {
        console.error(`❌ Error parsing theme data for ${row.id}:`, parseError);
        // Skip bad rows instead of throwing — one bad row shouldn't kill everything
        return null;
      }
    }).filter((t): t is Theme => t !== null);

    // Update cache
    themesCache = themes.length > 0 ? themes : LOCAL_THEMES;
    themeMapCache = null;
    cacheExpiry = Date.now() + CACHE_DURATION;
    fetchErrorAt = 0; // clear error state on success

    console.log(`✅ Loaded ${themesCache.length} themes`);
    return themesCache;

  } catch (error) {
    // Record the error time for backoff, then return local fallbacks
    fetchErrorAt = Date.now();
    console.warn('⚠️ DB unavailable — falling back to local bundled themes', error);
    return LOCAL_THEMES;
  }
}

// Get themes (cached)
export async function getThemes(): Promise<Theme[]> {
  return await fetchThemes();
}

// Create theme map
export async function getThemeMap(): Promise<Record<string, Theme>> {
  // Check cache first
  if (themeMapCache && Date.now() < cacheExpiry) {
    return themeMapCache;
  }

  const themes = await fetchThemes();
  themeMapCache = Object.fromEntries(themes.map(theme => [theme.id, theme]));
  
  return themeMapCache;
}

// Get a specific theme by ID — always falls back to local bundled themes
export async function getThemeById(id: string): Promise<Theme | null> {
  try {
    const themeMap = await getThemeMap();
    return themeMap[id] || LOCAL_THEME_MAP[id] || LOCAL_THEME_MAP[defaultThemeId] || null;
  } catch (error) {
    console.error(`❌ Error getting theme ${id}:`, error);
    return LOCAL_THEME_MAP[id] || LOCAL_THEME_MAP[defaultThemeId] || null;
  }
}

// Clear cache (call this when themes are updated)
export function clearThemeCache(): void {
  themesCache = null;
  themeMapCache = null;
  cacheExpiry = 0;
  console.log('🗑️ Theme cache cleared');
}

// Default theme ID
export const defaultThemeId = 'default';

export const themes = [] as Theme[];

export const themeMap = {} as Record<string, Theme>;

// Helper function to get available theme IDs — never returns empty
export async function getAvailableThemeIds(): Promise<string[]> {
  try {
    const themes = await fetchThemes();
    return themes.length > 0 ? themes.map(t => t.id) : LOCAL_THEMES.map(t => t.id);
  } catch (error) {
    console.error('❌ Error getting theme IDs:', error);
    return LOCAL_THEMES.map(t => t.id);
  }
}

// Helper function to check if a theme exists
export async function themeExists(id: string): Promise<boolean> {
  try {
    const theme = await getThemeById(id);
    return theme !== null;
  } catch (error) {
    console.error(`❌ Error checking if theme ${id} exists:`, error);
    return false;
  }
}

// Helper function to get system themes only
export async function getSystemThemes(): Promise<Theme[]> {
  try {
    const { data, error } = await supabase
      .from('themes')
      .select('*')
      .eq('is_system', true)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    return (data || []).map(row => ({
      ...(row.theme_data as Theme),
      id: row.id,
      name: row.name,
      description: row.description,
      previewColor: row.preview_color,
    }));
  } catch (error) {
    console.error('❌ Error fetching system themes:', error);
    return [];
  }
}

// NOTE: No module-load prefetch. The Providers component handles initial
// theme loading inside a useEffect with proper error handling.