// lib/dynamicFontManager.ts
class DynamicFontManager {
  private loadedFonts: Set<string> = new Set();
  private fontLinks: Map<string, HTMLLinkElement> = new Map();
  
  // Google Fonts database - auto-generates URLs
  private getGoogleFontUrl(fontName: string): string | null {
    const fontWeights = '300;400;500;600;700';
    const encodedName = fontName.replace(/\s+/g, '+');
    
    // List of known Google Fonts - UPDATED with all your theme fonts
    const googleFonts = [
      'Architects Daughter', 'Plus Jakarta Sans', 'Source Serif 4', 'JetBrains Mono',
      'Fira Code', 'Inter', 'Roboto', 'Open Sans', 'Poppins', 'Montserrat',
      'Playfair Display', 'Lora', 'Merriweather', 'Space Grotesk', 'DM Sans',
      'IBM Plex Sans', 'IBM Plex Mono', 'Geist', 'Geist Mono', 'Outfit',
      'Source Code Pro', 'Roboto Mono', 'Space Mono',
      'Libre Baskerville',  // Vintage theme
      'Oxanium'            // Sharp theme - THIS WAS MISSING!
    ];
    
    if (googleFonts.includes(fontName)) {
      return `https://fonts.googleapis.com/css2?family=${encodedName}:wght@${fontWeights}&display=swap`;
    }
    return null;
  }
  
  // System fonts that don't need loading
  private isSystemFont(fontName: string): boolean {
    const systemFonts = [
      'System', 'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Courier New',
      'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman',
      'Trebuchet MS', 'Arial Black', 'Impact', 'sans-serif', 'serif', 'monospace',
      'ui-serif', 'Cambria'  // Added system fonts used in Sharp theme
    ];
    return systemFonts.includes(fontName);
  }
  
  // Extract font name from CSS font stack
  private extractFontName(fontStack: string): string {
    return fontStack.split(',')[0].trim().replace(/['"]/g, '');
  }
  
  // Load a single font
  async loadFont(fontName: string): Promise<void> {
    if (this.isSystemFont(fontName) || this.loadedFonts.has(fontName)) {
      return;
    }
    
    const googleUrl = this.getGoogleFontUrl(fontName);
    if (!googleUrl) {
      console.warn(`⚠️ Font "${fontName}" not found in Google Fonts database`);
      return;
    }
    
    try {
      console.log(`🔤 Loading font: ${fontName}`);
      await this.loadGoogleFont(fontName, googleUrl);
      this.loadedFonts.add(fontName);
      console.log(`✅ Font "${fontName}" loaded successfully`);
    } catch (error) {
      console.error(`❌ Failed to load font "${fontName}":`, error);
    }
  }
  
  // Load Google Font via link tag
  private async loadGoogleFont(name: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Remove existing font link if it exists
      if (this.fontLinks.has(name)) {
        const existingLink = this.fontLinks.get(name);
        existingLink?.remove();
        this.fontLinks.delete(name);
      }
      
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.crossOrigin = 'anonymous';
      
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load ${name}`));
      
      document.head.appendChild(link);
      this.fontLinks.set(name, link);
    });
  }
  
  // Auto-detect and load fonts from CSS variables
  async autoLoadFontsFromCSS(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    
    // Get font stacks from CSS variables
    const fontSans = computedStyle.getPropertyValue('--font-sans').trim();
    const fontSerif = computedStyle.getPropertyValue('--font-serif').trim();
    const fontMono = computedStyle.getPropertyValue('--font-mono').trim();
    
    // Extract font names
    const fontsToLoad = [
      fontSans ? this.extractFontName(fontSans) : null,
      fontSerif ? this.extractFontName(fontSerif) : null,
      fontMono ? this.extractFontName(fontMono) : null
    ].filter((font): font is string => font !== null && !this.isSystemFont(font));
    
    if (fontsToLoad.length === 0) {
      console.log('📝 No custom fonts detected in CSS variables');
      return;
    }
    
    console.log(`🎨 Auto-detected fonts to load:`, fontsToLoad);
    
    // Load all unique fonts
    const uniqueFonts = [...new Set(fontsToLoad)];
    const loadPromises = uniqueFonts.map(font => this.loadFont(font));
    await Promise.all(loadPromises);
    
    console.log(`✅ Auto-loaded fonts: [${this.getLoadedFonts().join(', ')}]`);
  }
  
  // Get list of currently loaded fonts
  getLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }
  
  // Clear all loaded fonts
  clearAllFonts(): void {
    this.fontLinks.forEach((link, name) => {
      link.remove();
      console.log(`🗑️ Removed font: ${name}`);
    });
    this.fontLinks.clear();
    this.loadedFonts.clear();
  }
  
  // Add a new Google Font to the database
  addGoogleFont(fontName: string): void {
    console.log(`📚 Added "${fontName}" to Google Fonts database`);
  }
}

export const dynamicFontManager = new DynamicFontManager();