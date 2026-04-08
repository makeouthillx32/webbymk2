// themes/index.ts
import type { Theme } from '@/types/theme';
import { createBrowserClient } from '@supabase/ssr';

// Create Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Cache for themes to avoid repeated database calls
let themesCache: Theme[] | null = null;
let themeMapCache: Record<string, Theme> | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch themes from database
export async function fetchThemes(): Promise<Theme[]> {
  // Check cache first
  if (themesCache && Date.now() < cacheExpiry) {
    return themesCache;
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
      console.warn('⚠️ No themes found in database');
      return [];
    }

    // Transform database rows to Theme objects
    const themes: Theme[] = data.map(row => {
      try {
        // Parse the theme_data JSONB
        const themeData = row.theme_data as Theme;
        
        // Ensure the theme has all required properties
        return {
          ...themeData,
          id: row.id, // Use database ID
          name: row.name, // Use database name
          description: row.description, // Use database description
          previewColor: row.preview_color, // Use database preview color
        };
      } catch (parseError) {
        console.error(`❌ Error parsing theme data for ${row.id}:`, parseError);
        throw new Error(`Invalid theme data for ${row.id}`);
      }
    });

    // Update cache
    themesCache = themes;
    themeMapCache = null; // Clear theme map cache
    cacheExpiry = Date.now() + CACHE_DURATION;
    
    console.log(`✅ Loaded ${themes.length} themes from database`);
    return themes;
    
  } catch (error) {
    console.error('❌ Fatal error fetching themes:', error);
    throw error;
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

// Get a specific theme by ID
export async function getThemeById(id: string): Promise<Theme | null> {
  try {
    const themeMap = await getThemeMap();
    return themeMap[id] || null;
  } catch (error) {
    console.error(`❌ Error getting theme ${id}:`, error);
    return null;
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

// Helper function to get available theme IDs
export async function getAvailableThemeIds(): Promise<string[]> {
  try {
    const themes = await fetchThemes();
    return themes.map(theme => theme.id);
  } catch (error) {
    console.error('❌ Error getting theme IDs:', error);
    return [];
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

// Initialize themes on module load (optional - for warming cache)
if (typeof window !== 'undefined') {
  // Only in browser environment
  fetchThemes().catch(error => {
    console.warn('⚠️ Failed to pre-load themes:', error);
  });
}