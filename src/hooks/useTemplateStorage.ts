// hooks/useTemplateStorage.ts
"use client";

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Template interface matching your current format
export interface Template {
  id: string;
  name: string;
  path: string;
  category: string;
  description?: string;
  metadata?: {
    originalName?: string;
    fileSize?: number;
    uploadedAt?: string;
    uploadedBy?: string;
    dimensions?: {
      width: number;
      height: number;
    };
  };
}

// Template write format for uploading
export interface TemplateUpload {
  file: File;
  categories: string[]; // Changed from single category to array
  description?: string;
  customName?: string;
}

// Hook return type
interface UseTemplateStorageReturn {
  templates: Template[];
  categories: string[];
  isLoading: boolean;
  error: string | null;
  // Read operations
  refreshTemplates: () => Promise<void>;
  getTemplatesByCategory: (category: string) => Template[];
  getTemplateById: (id: string) => Template | null;
  // Write operations
  uploadTemplate: (upload: TemplateUpload) => Promise<Template | null>;
  deleteTemplate: (templateId: string) => Promise<boolean>;
  updateTemplateMetadata: (templateId: string, updates: Partial<Template>) => Promise<boolean>;
  // Batch operations
  uploadMultipleTemplates: (uploads: TemplateUpload[]) => Promise<Template[]>;
  exportTemplateManifest: () => string;
  importTemplateManifest: (manifestJson: string) => Promise<void>;
}

// Configuration
const STORAGE_BUCKET = 'punchcards';
const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const METADATA_TABLE = 'template_metadata'; // Optional: store metadata in a table

export const useTemplateStorage = (): UseTemplateStorageReturn => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Generate standardized template ID and filename
  const generateTemplateId = useCallback((file: File, category: string): string => {
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '');
    return `${category}_${sanitizedName}_${timestamp}`;
  }, []);

  // Generate filename following your naming pattern (Pc1.png, Pc2_vintage_modern.png, etc.)
  const generateFilename = useCallback(async (categories: string | string[]): Promise<string> => {
    try {
      // Get existing files to determine next number
      const { data: existingFiles } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list('', {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (!existingFiles) {
        const categoryString = Array.isArray(categories) ? categories.join('_') : categories;
        return categoryString ? `Pc1_${categoryString}.png` : `Pc1.png`;
      }

      // Extract numbers from existing files (Pc1.png, Pc2_vintage.png, etc.)
      const numbers = existingFiles
        .map(file => {
          const match = file.name.match(/^Pc(\d+)(?:_.*)?\.png$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0)
        .sort((a, b) => a - b);

      // Find next available number
      let nextNumber = 1;
      for (const num of numbers) {
        if (num === nextNumber) {
          nextNumber++;
        } else {
          break;
        }
      }

      // Build filename with categories
      const categoryString = Array.isArray(categories) ? categories.join('_') : categories;
      return categoryString ? `Pc${nextNumber}_${categoryString}.png` : `Pc${nextNumber}.png`;
    } catch (err) {
      console.error('Error generating filename:', err);
      // Fallback to timestamp-based naming
      const categoryString = Array.isArray(categories) ? categories.join('_') : categories;
      return categoryString ? `Pc${Date.now()}_${categoryString}.png` : `Pc${Date.now()}.png`;
    }
  }, [supabase]);

  // Parse template data from file path and metadata
  const parseTemplateFromPath = useCallback((filePath: string, fileMetadata?: any): Template => {
    const filename = filePath.split('/').pop() || '';
    const id = filename.replace(/\.[^/.]+$/, ''); // Remove extension for ID
    
    // Parse filename format: Pc3_vintage_modern.png or Pc1.png
    const parts = filename.replace(/\.[^/.]+$/, '').split('_');
    const numberMatch = parts[0].match(/Pc(\d+)/);
    const number = numberMatch ? parseInt(numberMatch[1]) : 999;
    
    // Extract categories from filename (everything after Pc#_)
    const categories = parts.slice(1).filter(Boolean);
    let category = 'modern'; // default
    
    if (categories.length > 0) {
      // Use categories from filename
      category = categories.join('_');
    } else {
      // Fallback to number-based categorization for legacy files
      if (number >= 1 && number <= 10) category = 'vintage';
      else if (number >= 11 && number <= 20) category = 'modern';
      else if (number >= 21 && number <= 30) category = 'professional';
      else if (number >= 31 && number <= 40) category = 'creative';
    }

    return {
      id,
      name: `Punch Card Design ${number}`,
      path: `${BASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`,
      category,
      description: getCategoryDescription(categories[0] || category),
      metadata: {
        originalName: filename,
        uploadedAt: fileMetadata?.created_at || new Date().toISOString(),
        fileSize: fileMetadata?.metadata?.size,
        dimensions: {
          width: 1088, // Standard punch card width
          height: 638  // Standard punch card height
        }
      }
    };
  }, []);

  // Get category description
  const getCategoryDescription = useCallback((category: string): string => {
    const descriptions = {
      vintage: 'Classic retro design style',
      modern: 'Contemporary clean layout',
      professional: 'Business-ready format',
      creative: 'Artistic and unique design',
      minimal: 'Simple and clean aesthetic',
      colorful: 'Vibrant and eye-catching',
      elegant: 'Sophisticated and refined',
      playful: 'Fun and engaging design',
      corporate: 'Professional business style',
      artistic: 'Creative and expressive'
    };
    return descriptions[category as keyof typeof descriptions] || 'Custom design template';
  }, []);

  // Load all templates from storage
  const refreshTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: files, error: listError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list('', {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (listError) {
        throw new Error(`Failed to list templates: ${listError.message}`);
      }

      if (!files) {
        setTemplates([]);
        return;
      }

      // Filter for image files only
      const imageFiles = files.filter(file => 
        file.name.match(/\.(png|jpg|jpeg|webp)$/i)
      );

      // Convert to Template objects
      const templateList = imageFiles.map(file => 
        parseTemplateFromPath(file.name, file)
      );

      // Sort by number extracted from filename
      templateList.sort((a, b) => {
        const aNum = parseInt(a.id.replace(/\D/g, '')) || 999;
        const bNum = parseInt(b.id.replace(/\D/g, '')) || 999;
        return aNum - bNum;
      });

      setTemplates(templateList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load templates';
      setError(errorMessage);
      console.error('Error loading templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, parseTemplateFromPath]);

  // Get templates by category (supports multi-category filtering)
  const getTemplatesByCategory = useCallback((category: string): Template[] => {
    if (category === 'all') return templates;
    
    return templates.filter(template => {
      // Check if the category exists in any part of the template's category string
      const templateCategories = template.category.split('_');
      return templateCategories.includes(category);
    });
  }, [templates]);

  // Get template by ID
  const getTemplateById = useCallback((id: string): Template | null => {
    return templates.find(template => template.id === id) || null;
  }, [templates]);

  // Upload a single template
  const uploadTemplate = useCallback(async (upload: TemplateUpload): Promise<Template | null> => {
    try {
      setError(null);

      // Validate file
      if (!upload.file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      if (upload.file.size > 5 * 1024 * 1024) { // 5MB limit
        throw new Error('File size must be less than 5MB');
      }

      // Generate filename with categories
      const filename = await generateFilename(upload.categories);
      
      // Upload file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filename, upload.file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Create template object
      const newTemplate: Template = {
        id: filename.replace(/\.[^/.]+$/, ''),
        name: upload.customName || `Punch Card Design ${filename.match(/\d+/)?.[0] || 'Custom'}`,
        path: `${BASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`,
        category: upload.categories.join('_'),
        description: upload.description || getCategoryDescription(upload.categories[0] || 'modern'),
        metadata: {
          originalName: upload.file.name,
          fileSize: upload.file.size,
          uploadedAt: new Date().toISOString(),
          dimensions: {
            width: 1088,
            height: 638
          }
        }
      };

      // Refresh templates list
      await refreshTemplates();

      return newTemplate;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('Error uploading template:', err);
      return null;
    }
  }, [supabase, generateFilename, getCategoryDescription, refreshTemplates]);

  // Delete a template
  const deleteTemplate = useCallback(async (templateId: string): Promise<boolean> => {
    try {
      setError(null);

      const template = getTemplateById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Extract filename from path
      const filename = template.path.split('/').pop();
      if (!filename) {
        throw new Error('Invalid template path');
      }

      const { error: deleteError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filename]);

      if (deleteError) {
        throw new Error(`Delete failed: ${deleteError.message}`);
      }

      // Refresh templates list
      await refreshTemplates();

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed';
      setError(errorMessage);
      console.error('Error deleting template:', err);
      return false;
    }
  }, [supabase, getTemplateById, refreshTemplates]);

  // Update template metadata
  const updateTemplateMetadata = useCallback(async (templateId: string, updates: Partial<Template>): Promise<boolean> => {
    try {
      setError(null);

      // Update local state immediately
      setTemplates(prev => prev.map(template => 
        template.id === templateId 
          ? { ...template, ...updates }
          : template
      ));

      // Note: If you want to persist metadata changes, you'd need to:
      // 1. Store metadata in a database table
      // 2. Or encode metadata in the filename/path
      // For now, changes are only local until refresh

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Update failed';
      setError(errorMessage);
      console.error('Error updating template metadata:', err);
      return false;
    }
  }, []);

  // Upload multiple templates
  const uploadMultipleTemplates = useCallback(async (uploads: TemplateUpload[]): Promise<Template[]> => {
    const results: Template[] = [];
    
    for (const upload of uploads) {
      const result = await uploadTemplate(upload);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }, [uploadTemplate]);

  // Export template manifest as JSON
  const exportTemplateManifest = useCallback((): string => {
    const manifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      templates: templates.map(template => ({
        ...template,
        // Don't include full URL in export, just relative path
        path: template.path.split('/').pop()
      }))
    };

    return JSON.stringify(manifest, null, 2);
  }, [templates]);

  // Import template manifest
  const importTemplateManifest = useCallback(async (manifestJson: string): Promise<void> => {
    try {
      const manifest = JSON.parse(manifestJson);
      
      if (!manifest.templates || !Array.isArray(manifest.templates)) {
        throw new Error('Invalid manifest format');
      }

      // This would typically involve uploading the actual files
      // For now, we just log what would be imported
      console.log('Would import templates:', manifest.templates);
      
      // Refresh to pick up any new files
      await refreshTemplates();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Import failed';
      setError(errorMessage);
      console.error('Error importing manifest:', err);
    }
  }, [refreshTemplates]);

  // Get unique categories from all templates
  const getAllCategories = useCallback((): string[] => {
    const categorySet = new Set<string>();
    
    templates.forEach(template => {
      // Split multi-category templates and add each category individually
      const cats = template.category.split('_');
      cats.forEach(cat => {
        if (cat && cat.trim()) {
          categorySet.add(cat.trim());
        }
      });
    });

    return Array.from(categorySet).sort();
  }, [templates]);

  // Get unique categories
  const categories = ['all', ...getAllCategories()];

  // Load templates on mount
  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  return {
    templates,
    categories,
    isLoading,
    error,
    refreshTemplates,
    getTemplatesByCategory,
    getTemplateById,
    uploadTemplate,
    deleteTemplate,
    updateTemplateMetadata,
    uploadMultipleTemplates,
    exportTemplateManifest,
    importTemplateManifest
  };
};