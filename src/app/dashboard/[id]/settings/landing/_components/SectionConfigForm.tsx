// app/dashboard/[id]/settings/landing/_components/SectionConfigForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import "./landing.scss";

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

  // Special handler for categories_grid that auto-updates columns
  const updateCategoryIds = (selectedIds: string[]) => {
    const newConfig = { ...config };
    
    if (selectedIds.length === 0) {
      // No categories selected - remove both fields
      delete newConfig.categoryIds;
      delete newConfig.columns;
    } else {
      // Set the selected categories
      newConfig.categoryIds = selectedIds;
      // Auto-calculate columns based on number of selected categories
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

  // HERO CAROUSEL FORM
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
    const selectedCategoryIds = config.categoryIds || [];
    const selectedCategories = selectedCategoryIds
      .map((id: string) => categories.find(c => c.id === id))
      .filter(Boolean);

    const allSelected = categories.length > 0 && selectedCategoryIds.length === categories.length;
    const noneSelected = selectedCategoryIds.length === 0;

    const handleSelectAll = () => {
      const allCategoryIds = categories.map(c => c.id);
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

  // Fallback for unknown types
  return (
    <div className="form-field">
      <p className="form-hint">No configuration form available for this section type.</p>
      <p className="form-hint">Use the Advanced JSON Editor to configure this section.</p>
    </div>
  );
}