// app/dashboard/[id]/settings/landing/_components/SectionConfigForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import "./landing.scss";
import { CardOverlayEditor, type PreviewCategory } from "./CardOverlayEditor";

interface SectionConfigFormProps {
  type: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

interface CollectionOption {
  id: string;
  name: string;
  slug: string;
  product_count?: number;
}

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  product_count?: number;
  // Carried through for the card-overlay preview so it renders over the real
  // cover with the real words instead of a stand-in.
  coverImageUrl?: string | null;
  eyebrow?: string | null;
  tagline?: string | null;
  subtitle?: string | null;
  cta_label?: string | null;
  text_color_token?: string | null;
}

interface StaticPageOption {
  id: string;
  slug: string;
  title: string;
  is_published: boolean;
}

export function SectionConfigForm({ type, config, onChange }: SectionConfigFormProps) {
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [staticPages, setStaticPages] = useState<StaticPageOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch collections, categories, and static pages on mount
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [collectionsRes, categoriesRes, staticPagesRes] = await Promise.all([
          fetch('/api/collections'),
          fetch('/api/categories'),
          fetch('/api/static-pages/slugs'),
        ]);
        
        if (collectionsRes.ok) {
          const collectionsData = await collectionsRes.json();
          setCollections(collectionsData.data || collectionsData.collections || []);
        }
        
        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
          setCategories(categoriesData.data || categoriesData.categories || []);
        }

        if (staticPagesRes.ok) {
          const staticPagesData = await staticPagesRes.json();
          setStaticPages(staticPagesData.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch options:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  const updateField = (field: string, value: any) => {
    // Handle empty strings as null for optional fields
    const cleanValue = value === '' ? null : value;
    
    // Remove the field entirely if it's null/undefined
    if (cleanValue === null || cleanValue === undefined) {
      const newConfig = { ...config };
      delete newConfig[field];
      onChange(newConfig);
    } else {
      onChange({ ...config, [field]: cleanValue });
    }
  };

  // Selection handler for categories_grid.
  //
  // Writes `itemIds` — the source-agnostic key — and clears the legacy
  // `categoryIds` so a section can't end up carrying both and disagreeing with
  // itself. The renderer still reads `categoryIds` as a fallback for sections
  // last saved before the source switch existed.
  const updateCategoryIds = (selectedIds: string[]) => {
    const newConfig = { ...config };
    delete newConfig.categoryIds;

    if (selectedIds.length === 0) {
      delete newConfig.itemIds;
      delete newConfig.columns;
    } else {
      newConfig.itemIds = selectedIds;
      newConfig.columns = selectedIds.length;
    }

    onChange(newConfig);
  };

  if (loading) {
    return (
      <div className="form-field">
        <p className="form-hint">Loading configuration options...</p>
      </div>
    );
  }

  // TOP BANNER FORM
  if (type === 'top_banner') {
    return (
      <div className="custom-component-notice">
        <div className="notice-icon">ℹ️</div>
        <div className="notice-content">
          <h4>Custom Component by unenter</h4>
          <p>
            This section uses a custom-built component that doesn't require configuration. 
            The announcement banner is managed directly in the component code.
          </p>
          <p className="notice-hint">
            Simply add this section to your landing page - it will work automatically.
          </p>
        </div>
      </div>
    );
  }

  // INTERACTIVE 3D BANNER FORM
  if (type === 'hero_3d') {
    return (
      <>
        <div className="custom-component-notice" style={{ marginBottom: 16 }}>
          <div className="notice-icon">ℹ️</div>
          <div className="notice-content">
            <h4>Custom Component by unenter</h4>
            <p>
              Full hero block — the 4K video backdrop, the starry loop and the three.js
              logo scene. Placing this replaces the built-in home hero entirely.
            </p>
            <p className="notice-hint">
              The video, backdrop and 3D model are all swappable from the site asset
              registry with no rebuild. The options below are styling only.
            </p>
          </div>
        </div>

        <div className="form-field">
          <label className="form-label">
            <input
              type="checkbox"
              checked={config.showVideo !== false}
              onChange={(e) => updateField('showVideo', e.target.checked)}
            />{' '}
            Show 4K video backdrop
          </label>
          <p className="form-hint">Layers the hero video behind the 3D scene (default on)</p>
        </div>

        <div className="form-field">
          <label className="form-label">Video opacity</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={config.videoOpacity ?? 0.3}
            onChange={(e) => updateField('videoOpacity', parseFloat(e.target.value))}
            className="form-input"
          />
          <p className="form-hint">0 = hidden, 1 = full strength (default 0.3)</p>
        </div>

        <div className="form-field">
          <label className="form-label">Minimum height (optional)</label>
          <input
            type="text"
            value={config.minHeight || ''}
            onChange={(e) => updateField('minHeight', e.target.value)}
            className="form-input"
            placeholder="e.g. 100vh — leave empty to size to content"
          />
          <p className="form-hint">Any CSS length. Empty = the scene sizes itself.</p>
        </div>
      </>
    );
  }

  // FOOTER CHROME / DECORATION FORM
  if (type === 'footer_chrome') {
    return (
      <>
        <div className="form-field">
          <label className="form-label">Shapes</label>
          <select
            value={config.shapes || 'both'}
            onChange={(e) => updateField('shapes', e.target.value)}
            className="form-input"
          >
            <option value="both">Both (polygon + orb)</option>
            <option value="polygon">Polygon only (bottom-left)</option>
            <option value="orb">Orb only (top-right)</option>
          </select>
          <p className="form-hint">Which decorative shapes to draw in the band</p>
        </div>

        <div className="form-field">
          <label className="form-label">Tint</label>
          <select
            value={config.tint || 'primary'}
            onChange={(e) => updateField('tint', e.target.value)}
            className="form-input"
          >
            <option value="primary">Primary (theme)</option>
            <option value="accent">Accent (theme)</option>
            <option value="muted">Muted (theme)</option>
            <option value="foreground">Foreground (theme)</option>
          </select>
          <p className="form-hint">
            Always a theme token — the decoration follows the active theme per zone.
            No fixed colours, so it can never drift out of palette again.
          </p>
        </div>

        <div className="form-field">
          <label className="form-label">Opacity</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={config.opacity ?? 0.5}
            onChange={(e) => updateField('opacity', parseFloat(e.target.value))}
            className="form-input"
          />
          <p className="form-hint">0 = invisible, 1 = full strength (default 0.5)</p>
        </div>

        <div className="form-field">
          <label className="form-label">Band height (px)</label>
          <input
            type="number"
            min="40"
            max="600"
            step="10"
            value={config.height ?? 180}
            onChange={(e) => updateField('height', parseInt(e.target.value) || 180)}
            className="form-input"
          />
          <p className="form-hint">Vertical space the decoration occupies</p>
        </div>

        <div className="form-field">
          <label className="form-label">
            <input
              type="checkbox"
              checked={config.flip === true}
              onChange={(e) => updateField('flip', e.target.checked)}
            />{' '}
            Mirror horizontally
          </label>
          <p className="form-hint">Swaps which side each shape sits on</p>
        </div>
      </>
    );
  }

  if (type === 'hero_carousel') {
    return (
      <div className="custom-component-notice">
        <div className="notice-icon">ℹ️</div>
        <div className="notice-content">
          <h4>Custom Component by unenter</h4>
          <p>
            This section uses a custom-built component that doesn't require configuration. 
            The category carousel is managed directly in the component code and automatically 
            pulls category images from your database.
          </p>
          <p className="notice-hint">
            Simply add this section to your landing page - it will work automatically.
          </p>
        </div>
      </div>
    );
  }

  // CATEGORIES GRID FORM - MOBILE-FRIENDLY CHECKBOX VERSION
  if (type === 'categories_grid') {
    // Which taxonomy this grid draws cards from. Tags are deliberately absent:
    // a tag is a filter attached to a product, never a card with its own art.
    const source: 'categories' | 'collections' =
      config.source === 'collections' ? 'collections' : 'categories';
    const sourceItems: any[] = source === 'collections' ? collections : categories;
    const selectedCategoryIds = config.itemIds || config.categoryIds || [];
    const selectedCategories = selectedCategoryIds
      .map((id: string) => sourceItems.find((c: any) => c.id === id))
      .filter(Boolean);

    const previewSource = selectedCategories.length > 0 ? selectedCategories : sourceItems;
    const previewCategories: PreviewCategory[] = previewSource.map((c: CategoryOption) => ({
      id: c.id,
      name: c.name,
      coverImageUrl: c.coverImageUrl,
      eyebrow: c.eyebrow,
      tagline: c.tagline,
      subtitle: c.subtitle,
      cta_label: c.cta_label,
      text_color_token: c.text_color_token,
    }));

    const allSelected = sourceItems.length > 0 && selectedCategoryIds.length === sourceItems.length;
    const noneSelected = selectedCategoryIds.length === 0;

    const handleSelectAll = () => {
      const allCategoryIds = sourceItems.map((c: any) => c.id);
      updateCategoryIds(allCategoryIds);
    };

    const handleDeselectAll = () => {
      updateCategoryIds([]);
    };

    const toggleCategory = (categoryId: string) => {
      const currentIds = [...selectedCategoryIds];
      const index = currentIds.indexOf(categoryId);
      
      if (index > -1) {
        // Remove it
        currentIds.splice(index, 1);
      } else {
        // Add it
        currentIds.push(categoryId);
      }
      
      updateCategoryIds(currentIds);
    };

    return (
      <>
        <div className="form-field">
          <label className="form-label">Section Title</label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            className="form-input"
            placeholder="Shop by Category"
          />
        </div>

        <div className="form-field">
          <div className="form-label-with-actions">
            <label className="form-label">Select Categories to Display</label>
            <div className="form-actions">
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={allSelected}
                className="btn-select-action"
                title="Select all categories"
              >
                ✓ Select All
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                disabled={noneSelected}
                className="btn-select-action"
                title="Deselect all categories"
              >
                ✕ Clear All
              </button>
            </div>
          </div>
          
          <p className="form-hint">
            Tap categories to select/deselect. Columns will automatically match the number of categories selected.
          </p>
          
          {/* Checkbox-based category picker */}
          <div className="category-checkbox-grid">
            {categories.map(cat => {
              const isSelected = selectedCategoryIds.includes(cat.id);
              return (
                <label
                  key={cat.id}
                  className={`category-checkbox-item ${isSelected ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCategory(cat.id)}
                    className="category-checkbox-input"
                  />
                  <span className="category-checkbox-label">{cat.name}</span>
                  <span className="category-checkbox-checkmark">
                    {isSelected ? '✓' : ''}
                  </span>
                </label>
              );
            })}
          </div>
          
          {categories.length === 0 && (
            <p className="form-hint" style={{ marginTop: '12px', color: '#ef4444' }}>
              ⚠️ No categories available. Create categories in Dashboard → Settings → Categories.
            </p>
          )}
          
          {/* Summary of selection */}
          {selectedCategories.length > 0 ? (
            <div className="config-summary" style={{ marginTop: '12px' }}>
              <p className="config-summary-title">✓ Selection Summary:</p>
              <p className="config-summary-text">
                Displaying <strong>{selectedCategories.length}</strong> of <strong>{categories.length}</strong> total{' '}
                {selectedCategories.length === 1 ? 'category' : 'categories'} 
                {' '}in a <strong>{selectedCategories.length}-column</strong> grid
              </p>
              <div style={{ marginTop: '8px' }}>
                <strong>Selected categories:</strong>
                <ul style={{ marginTop: '4px', paddingLeft: '20px', maxHeight: '120px', overflowY: 'auto' }}>
                  {selectedCategories.map((cat: any) => (
                    <li key={cat.id}>{cat.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="form-hint" style={{ marginTop: '12px', color: '#f59e0b' }}>
              ⚠️ No categories selected. Click "Select All" or tap categories to select them.
            </p>
          )}
        </div>

        <div className="form-field">
          <label className="form-label">Card source</label>
          <select
            className="form-input"
            value={source}
            onChange={(e) => {
              // Ids live in different tables, so a stale selection would silently
              // match nothing. Clear it with the switch.
              const next: Record<string, any> = { ...config, source: e.target.value };
              delete next.itemIds;
              delete next.categoryIds;
              onChange(next);
            }}
          >
            <option value="categories">Categories — what a product IS (browse structure)</option>
            <option value="collections">Collections — what you are PUSHING (merchandising)</option>
          </select>
          <p className="form-hint">
            Tags aren't offered: a tag is a filter attached to a product, not a card with its own artwork.
          </p>
        </div>

        <CardOverlayEditor
          config={config}
          updateField={updateField}
          categories={previewCategories}
        />
      </>
    );
  }

  // STATIC HTML FORM
  if (type === 'static_html') {
    return (
      <>
        <div className="form-field">
          <label className="form-label">Page Slug</label>
          {staticPages.length > 0 ? (
            <select
              value={config.slug || ''}
              onChange={(e) => updateField('slug', e.target.value)}
              className="form-select"
            >
              <option value="">— Select a page —</option>
              {staticPages.map((page) => (
                <option key={page.id} value={page.slug}>
                  {page.title} ({page.slug}){!page.is_published ? ' [unpublished]' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={config.slug || ''}
              onChange={(e) => updateField('slug', e.target.value)}
              className="form-input"
              placeholder="landing-qr-download"
            />
          )}
          <p className="form-hint">The static page to embed on the landing page</p>
        </div>

        <div className="form-field">
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={config.showTitle === true}
              onChange={(e) => updateField('showTitle', e.target.checked)}
              className="form-checkbox"
            />
            Show page title
          </label>
        </div>

        <div className="form-field">
          <label className="form-label">Container Width</label>
          <select
            value={config.containerWidth || 'full'}
            onChange={(e) => updateField('containerWidth', e.target.value)}
            className="form-select"
          >
            <option value="full">Full Width</option>
            <option value="contained">Contained (max-width)</option>
            <option value="narrow">Narrow</option>
          </select>
        </div>
      </>
    );
  }

  // PRODUCTS GRID FORM
  if (type === 'products_grid') {
    const selectedCollection = collections.find(c => c.slug === config.collection);
    
    return (
      <>
        {/* Summary Box - Only show if collection is selected */}
        {config.collection && (
          <div className="config-summary">
            <p className="config-summary-title">Section Preview:</p>
            <p className="config-summary-text">
              Showing {config.limit || 8} products from collection "{selectedCollection?.name || config.collection}"
              {config.featured && ' (featured only)'}
              {' - sorted by '}
              {config.sortBy === 'newest' && 'newest first'}
              {config.sortBy === 'featured' && 'featured first'}
              {config.sortBy === 'price-asc' && 'price (low to high)'}
              {config.sortBy === 'price-desc' && 'price (high to low)'}
              {!config.sortBy && 'newest first'}
            </p>
          </div>
        )}
        
        <div className="form-field">
          <label className="form-label">Section Title</label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            className="form-input"
            placeholder="Shop Bestsellers"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Description (optional)</label>
          <input
            type="text"
            value={config.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            className="form-input"
            placeholder="Our most-loved Western wear pieces"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Collection (Required)</label>
          <select
            value={config.collection || ''}
            onChange={(e) => {
              const newCollection = e.target.value;
              updateField('collection', newCollection || null);
              // Auto-update viewAllHref when collection changes
              if (newCollection && !config.viewAllHref) {
                updateField('viewAllHref', `/collections/${newCollection}`);
              }
            }}
            className="form-select"
          >
            <option value="">-- Select a Collection --</option>
            {collections.map(col => (
              <option key={col.id} value={col.slug}>
                {col.name}
                {col.product_count !== undefined && ` (${col.product_count} products)`}
              </option>
            ))}
          </select>
          <p className="form-hint">
            {config.collection 
              ? `Displaying products from "${selectedCollection?.name || config.collection}" collection` 
              : 'Please select a collection to display products from'}
          </p>
        </div>

        <div className="form-field">
          <label className="form-label">Number of Products to Show</label>
          <input
            type="number"
            min="1"
            max="50"
            value={config.limit || 8}
            onChange={(e) => updateField('limit', parseInt(e.target.value) || 8)}
            className="form-input"
          />
          <p className="form-hint">Maximum number of products to display in this section</p>
        </div>

        <div className="form-field">
          <label className="form-label">Sort By</label>
          <select
            value={config.sortBy || 'newest'}
            onChange={(e) => updateField('sortBy', e.target.value)}
            className="form-select"
          >
            <option value="newest">Newest First</option>
            <option value="featured">Featured First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={config.featured === true}
              onChange={(e) => updateField('featured', e.target.checked || null)}
              className="form-checkbox"
            />
            Show only featured products
          </label>
          <p className="form-hint">If checked, only products marked as "featured" will be shown</p>
        </div>

        <div className="form-field">
          <label className="form-label">"View All" Link (Optional)</label>
          <div className="input-with-button">
            <input
              type="text"
              value={config.viewAllHref || ''}
              onChange={(e) => updateField('viewAllHref', e.target.value || null)}
              className="form-input"
              placeholder={
                config.collection 
                  ? `/collections/${config.collection}` 
                  : '/shop'
              }
            />
            {config.collection && (
              <button
                type="button"
                onClick={() => updateField('viewAllHref', `/collections/${config.collection}`)}
                className="auto-fill-btn"
                title="Auto-fill with collection link"
              >
                Auto-fill
              </button>
            )}
          </div>
          <p className="form-hint">
            {config.collection 
              ? `Suggested: /collections/${config.collection} (links to this collection's page)` 
              : 'Suggested: /shop (links to main shop page). Leave empty to hide button.'}
          </p>
        </div>
      </>
    );
  }

  // RESEARCH PRODUCTS GRID FORM (Labs)
  if (type === 'research_products_grid') {
    return (
      <>
        <div className="form-field">
          <label className="form-label">Section Title</label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            className="form-input"
            placeholder="Research Chemicals"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Description (optional)</label>
          <input
            type="text"
            value={config.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            className="form-input"
            placeholder="Explore our research compound library"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Category slug (optional)</label>
          <input
            type="text"
            value={config.category || ''}
            onChange={(e) => updateField('category', e.target.value)}
            className="form-input"
            placeholder="Leave empty to show all active research chemicals"
          />
          <p className="form-hint">
            A research_categories slug. Leave blank to show all active products regardless of category.
          </p>
        </div>

        <div className="form-field">
          <label className="form-label">Number of Products to Show</label>
          <input
            type="number"
            min="1"
            max="50"
            value={config.limit || 8}
            onChange={(e) => updateField('limit', parseInt(e.target.value) || 8)}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Sort By</label>
          <select
            value={config.sortBy || 'newest'}
            onChange={(e) => updateField('sortBy', e.target.value)}
            className="form-select"
          >
            <option value="newest">Newest First</option>
            <option value="featured">Featured First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        <div className="form-field">
          <label className="form-checkbox-label">
            <input
              type="checkbox"
              checked={config.featured === true}
              onChange={(e) => updateField('featured', e.target.checked || null)}
              className="form-checkbox"
            />
            Show only featured products
          </label>
        </div>

        <div className="form-field">
          <label className="form-label">"View All" Link (Optional)</label>
          <input
            type="text"
            value={config.viewAllHref || ''}
            onChange={(e) => updateField('viewAllHref', e.target.value || null)}
            className="form-input"
            placeholder="/search"
          />
        </div>
      </>
    );
  }

  // FEATURED RESEARCH CAROUSEL FORM
  if (type === 'featured_research_carousel') {
    return (
      <>
        <div className="form-field">
          <label className="form-label">Section Title</label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            className="form-input"
            placeholder="Featured Products"
          />
          <p className="form-hint">Headline displayed above the pastel card carousel</p>
        </div>

        <div className="form-field">
          <label className="form-label">Category filter (optional)</label>
          <input
            type="text"
            value={config.category || ''}
            onChange={(e) => updateField('category', e.target.value)}
            className="form-input"
            placeholder="Leave empty to feature compounds across all categories"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Maximum Products to Load</label>
          <input
            type="number"
            min="1"
            max="20"
            value={config.limit || 8}
            onChange={(e) => updateField('limit', parseInt(e.target.value) || 8)}
            className="form-input"
          />
        </div>
      </>
    );
  }

  if (type === 'family_highlight') {
    return (
      <>
        <div className="form-field">
          <label className="form-label">Target Compound Family Keyword</label>
          <input
            type="text"
            value={config.family || ''}
            onChange={(e) => updateField('family', e.target.value)}
            className="form-input"
            placeholder="e.g. ghk, bpc, cjc, semaglutide, nad"
          />
          <p className="form-hint">Matches compounds belonging to this family (e.g. "ghk" for GHK-Cu, "bpc" for BPC-157)</p>
        </div>

        <div className="form-field">
          <label className="form-label">Section Title</label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            className="form-input"
            placeholder="Featured GHK-Cu Family"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Badge Label</label>
          <input
            type="text"
            value={config.badge || ''}
            onChange={(e) => updateField('badge', e.target.value)}
            className="form-input"
            placeholder="Highlighted Family"
          />
        </div>

        <div className="form-field">
          <label className="form-label">Description / Subtitle</label>
          <input
            type="text"
            value={config.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            className="form-input"
            placeholder="Explore all research formulations of this compound family."
          />
        </div>

        <div className="form-field">
          <label className="form-label">Limit Products Displayed</label>
          <input
            type="number"
            min="1"
            max="12"
            value={config.limit || 4}
            onChange={(e) => updateField('limit', parseInt(e.target.value) || 4)}
            className="form-input"
          />
        </div>
      </>
    );
  }

  // Fallback for unknown types
  return (
    <div className="form-field">
      <p className="form-hint">No configuration form available for this section type.</p>
      <p className="form-hint">Use the Advanced JSON Editor to configure this section.</p>
    </div>
  );
}