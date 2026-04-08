// app/dashboard/[id]/settings/landing/_components/CreateSectionModal.tsx
"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { SectionConfigForm } from "./SectionConfigForm";
import "./landing.scss";

interface CreateSectionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SECTION_TYPES = [
  { 
    value: "top_banner", 
    label: "Top Banner (Custom by unenter)", 
    description: "Announcement bar - Custom component, no configuration needed",
    config: {} // No config - custom component handles everything
  },
  { 
    value: "hero_carousel", 
    label: "Category Carousel (Custom by unenter)", 
    description: "Category image carousel - Custom component, no configuration needed",
    config: {} // No config - custom component handles everything
  },
  { 
    value: "categories_grid", 
    label: "Categories Grid", 
    description: "Display product categories in a grid layout",
    config: { 
      title: "Shop by Category", 
      columns: 3,
      showImages: true,
      categoryIds: [] // Leave empty to show all categories
    } 
  },
  { 
    value: "static_html", 
    label: "Static Page Embed", 
    description: "Embed a pre-made static page by slug (managed in separate upload flow)",
    config: { 
      slug: "landing-qr-download",
      showTitle: false,
      containerWidth: "full" // "full" | "contained" | "narrow"
    } 
  },
  { 
    value: "products_grid", 
    label: "Collection Products Grid", 
    description: "Display products from a specific collection",
    config: { 
      title: "Featured Collection",
      description: "Shop our curated selection",
      collection: "best-sellers", // Collection slug - shows products in this collection
      limit: 8, 
      sortBy: "featured",
      viewAllHref: "/collections/best-sellers" // Link to full collection page
    } 
  },
];

export function CreateSectionModal({ open, onClose, onSuccess }: CreateSectionModalProps) {
  const [type, setType] = useState("static_html");
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState(SECTION_TYPES.find(t => t.value === "static_html")?.config || {});
  const [configText, setConfigText] = useState(JSON.stringify(SECTION_TYPES.find(t => t.value === "static_html")?.config, null, 2));
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleTypeChange(newType: string) {
    setType(newType);
    const preset = SECTION_TYPES.find(t => t.value === newType);
    const newConfig = preset?.config || {};
    setConfig(newConfig);
    setConfigText(JSON.stringify(newConfig, null, 2));
  }

  function handleConfigChange(newConfig: Record<string, any>) {
    setConfig(newConfig);
    setConfigText(JSON.stringify(newConfig, null, 2));
  }

  function handleJsonTextChange(text: string) {
    setConfigText(text);
    try {
      const parsed = JSON.parse(text);
      setConfig(parsed);
      setError(null);
    } catch {
      // Don't update config object if JSON is invalid
      // Error will be shown when they try to save
    }
  }

  async function handleSave() {
    setError(null);
    
    let finalConfig = config;
    
    // If using JSON editor, validate and parse
    if (showJsonEditor) {
      try {
        finalConfig = JSON.parse(configText);
      } catch {
        setError("Invalid JSON in config");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/landing/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: 999,
          type,
          is_active: isActive,
          config: finalConfig,
        }),
      });

      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Failed to create section');
      }

      onSuccess();
      onClose();
      
      // Reset form
      const defaultPreset = SECTION_TYPES[3];
      setType("static_html");
      setIsActive(true);
      setConfig(defaultPreset.config);
      setConfigText(JSON.stringify(defaultPreset.config, null, 2));
      setShowJsonEditor(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create section');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="modal-overlay">
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <div>
              <h2 className="modal-title">Add Section</h2>
              <p className="modal-subtitle">
                Create a new section for your landing page
              </p>
            </div>
            <button onClick={onClose} className="modal-close">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="modal-body">
            {error && (
              <div className="modal-error">
                {error}
              </div>
            )}

            {/* Section Type */}
            <div className="form-field">
              <label className="form-label">
                Section Type
              </label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="form-select"
              >
                {SECTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {SECTION_TYPES.find(t => t.value === type)?.description && (
                <p className="form-hint">
                  {SECTION_TYPES.find(t => t.value === type)?.description}
                </p>
              )}
            </div>

            {/* Active Checkbox */}
            <div className="form-field">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="form-checkbox"
                />
                Active (show on landing page)
              </label>
            </div>

            {/* Config Section with Toggle */}
            <div className="form-field">
              <div className="config-header">
                <label className="form-label">Configuration</label>
                <button
                  type="button"
                  onClick={() => setShowJsonEditor(!showJsonEditor)}
                  className="toggle-editor-btn"
                >
                  {showJsonEditor ? '📝 Switch to Simple Form' : '⚙️ Advanced JSON Editor'}
                </button>
              </div>

              {showJsonEditor ? (
                <>
                  <textarea
                    value={configText}
                    onChange={(e) => handleJsonTextChange(e.target.value)}
                    className="form-textarea mono"
                    spellCheck={false}
                  />
                  <p className="form-hint">
                    {type === 'top_banner' && 'Configure message, link, background color, and dismissibility'}
                    {type === 'hero_carousel' && 'Configure slides with images, titles, subtitles, and CTA buttons'}
                    {type === 'categories_grid' && 'Configure title, number of columns, and which categories to display'}
                    {type === 'static_html' && 'Specify the slug of your static page to embed'}
                    {type === 'products_grid' && 'Configure title, filters (collection/category), limit, and sorting'}
                  </p>
                </>
              ) : (
                <div className="simple-form">
                  <SectionConfigForm 
                    type={type}
                    config={config}
                    onChange={handleConfigChange}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Creating...' : 'Create Section'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
