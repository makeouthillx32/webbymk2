// lib/document-urls.ts
/**
 * Document URL Utilities
 * 
 * Generate and copy different URL formats for documents.
 */

import { getDocumentUrl } from './documents';

export type UrlFormat = 'cdn' | 'id' | 'slug' | 'direct';

/**
 * Slugify a filename for pretty URLs
 */
export function slugifyFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[_\s]+/g, '-')  // Replace _ and spaces with -
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except -
    .replace(/-+/g, '-')        // Replace multiple - with single -
    .replace(/^-|-$/g, '');     // Remove leading/trailing -
}

/**
 * Generate all available URL formats for a document
 */
export function generateDocumentUrls(document: {
  id: string;
  name: string;
  path: string;
  parent_path?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
}) {
  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
  
  const urls: Record<UrlFormat, { url: string; label: string; description: string }> = {
    cdn: {
      url: `${baseUrl}/cdn/${document.path}`,
      label: 'CDN Path',
      description: 'Clean path - works like /public folder'
    },
    id: {
      url: `${baseUrl}/u/doc/${document.id}`,
      label: 'Document ID',
      description: 'Permanent link by UUID - never breaks'
    },
    slug: {
      url: `${baseUrl}/u/img/${slugifyFileName(document.name)}`,
      label: 'Pretty Slug',
      description: 'SEO-friendly URL for images'
    },
    direct: {
      url: document.storage_path ? getDocumentUrl(document.storage_path) : '',
      label: 'Direct Supabase',
      description: 'Direct Supabase storage URL'
    }
  };
  
  // Only include slug URL for images
  if (!document.mime_type?.startsWith('image/')) {
    delete urls.slug;
  }
  
  return urls;
}

/**
 * Copy URL to clipboard
 */
export async function copyUrlToClipboard(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        textArea.remove();
        return true;
      } catch (err) {
        textArea.remove();
        return false;
      }
    }
  } catch (err) {
    console.error('Failed to copy URL:', err);
    return false;
  }
}

/**
 * Generate HTML img tag for easy copying
 */
export function generateImageTag(document: {
  id: string;
  name: string;
  path: string;
  parent_path?: string | null;
  storage_path?: string | null;
}, format: UrlFormat = 'cdn'): string {
  const urls = generateDocumentUrls(document);
  const url = urls[format]?.url || urls.cdn.url;
  
  return `<img src="${url}" alt="${document.name.replace(/\.[^/.]+$/, '')}" />`;
}

/**
 * Generate markdown image syntax
 */
export function generateMarkdownImage(document: {
  id: string;
  name: string;
  path: string;
  parent_path?: string | null;
  storage_path?: string | null;
}, format: UrlFormat = 'cdn'): string {
  const urls = generateDocumentUrls(document);
  const url = urls[format]?.url || urls.cdn.url;
  
  return `![${document.name.replace(/\.[^/.]+$/, '')}](${url})`;
}

/**
 * Copy multiple formats at once (useful for developers)
 */
export function generateAllFormatsText(document: {
  id: string;
  name: string;
  path: string;
  parent_path?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
}): string {
  const urls = generateDocumentUrls(document);
  
  let text = `# ${document.name}\n\n`;
  
  Object.entries(urls).forEach(([key, value]) => {
    text += `**${value.label}**\n`;
    text += `${value.url}\n`;
    text += `_${value.description}_\n\n`;
  });
  
  if (document.mime_type?.startsWith('image/')) {
    text += `**HTML**\n`;
    text += `${generateImageTag(document, 'cdn')}\n\n`;
    
    text += `**Markdown**\n`;
    text += `${generateMarkdownImage(document, 'cdn')}\n`;
  }
  
  return text;
}