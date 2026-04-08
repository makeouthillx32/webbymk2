# 🎨 Modern Landing Page Manager - Installation Guide

## ✅ What You're Getting

A beautiful, drag-and-drop landing page manager with:
- 🎯 **Drag to reorder** sections (no up/down buttons!)
- ⚡ **Instant toggle** sections on/off
- 🎨 **Color-coded badges** for different section types
- 📝 **Clean modals** for creating/editing
- 💅 **Modern design** that matches your existing dashboard

## 📦 Installation Steps

### 1. Install Dependencies

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities lucide-react
```

### 2. Copy Files

Copy all files to your project:

```
app/dashboard/[id]/settings/landing/
├── page.tsx
└── _components/
    ├── LandingManager.tsx
    ├── SortableSection.tsx
    ├── CreateSectionModal.tsx
    ├── EditSectionModal.tsx
    ├── useLandingSections.ts
    └── types.ts
```

### 3. Verify API Route

Make sure your `app/api/landing/sections/route.ts` has **POST, PATCH, DELETE** methods.

The API should handle:
- `GET` - List sections
- `POST` - Create section
- `PATCH` - Update section (with swap support for reordering)
- `DELETE` - Delete section

### 4. Add to Navigation

Add a link to `/dashboard/[id]/settings/landing` in your settings sidebar.

## 🎯 Features

### Drag and Drop
- Click and hold the **grip handle** (⋮⋮)
- Drag to reorder
- Drop in new position
- Automatically saves to database

### Section Types (Color Coded)
- 🔵 **Top Banner** - Blue
- 🟣 **Hero Carousel** - Purple  
- 🟢 **Categories Grid** - Green
- 🟠 **Static HTML** - Orange
- 🩷 **Products Grid** - Pink

### Quick Actions
- 👁️ **Toggle visibility** - Show/hide sections instantly
- ✏️ **Edit** - Update config
- 🗑️ **Delete** - Remove section (with confirmation)

### Smart Config
Each section type has preset configurations:
- **Categories Grid**: `{ title: "Shop by Category", columns: 3 }`
- **Products Grid**: `{ title: "Shop Bestsellers", limit: 4, startIndex: 0 }`
- **Static HTML**: `{ slug: "landing-qr-download" }`

## 🎨 Design System

Uses your existing CSS variables:
- `--foreground` - Text color
- `--background` - Page background
- `--card` - Card backgrounds
- `--border` - Border colors
- `--primary` - Primary button color
- `--muted` - Muted text/backgrounds
- `--accent` - Hover states

## 🚀 Usage

### Creating a Section
1. Click **"Add Section"**
2. Choose section type
3. Edit JSON config
4. Click **"Create Section"**

### Reordering
1. Hover over a section
2. Click and hold the grip handle (⋮⋮)
3. Drag to new position
4. Release to save

### Editing
1. Click **Edit** button
2. Modify JSON config
3. Click **"Save Changes"**

### Toggling
- Click the **eye icon** to show/hide
- Green = Active
- Gray = Inactive

## 📝 Config Examples

### Static HTML Section
```json
{
  "slug": "landing-qr-download"
}
```

### Products Grid Section
```json
{
  "title": "Shop Bestsellers",
  "limit": 4,
  "startIndex": 0,
  "viewAllHref": "/shop"
}
```

### Categories Grid Section
```json
{
  "title": "Shop by Category",
  "columns": 3
}
```

## 🐛 Troubleshooting

### Drag not working?
- Make sure `@dnd-kit/*` packages are installed
- Check browser console for errors

### Sections not saving?
- Verify API route is returning `{ ok: true }`
- Check network tab for failed requests

### Styling looks broken?
- Ensure CSS variables are defined in your theme
- Check for conflicting Tailwind classes

## ✨ Next Steps

Want to enhance further? You can add:
- **Preview mode** - See changes before saving
- **Duplicate section** - Copy existing sections
- **Templates** - Save common configurations
- **Undo/Redo** - History of changes
- **Bulk actions** - Select multiple sections

---

**Status: Ready to use!** 🎉

Your landing page manager is now modern, intuitive, and beautiful!
