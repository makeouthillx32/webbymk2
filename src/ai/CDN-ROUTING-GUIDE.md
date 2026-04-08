# CDN-Style URL Routing Guide

## 🌐 Available URL Patterns

Your documents are now accessible through **clean, CDN-style URLs** that redirect (301) to Supabase Storage.

---

## 📍 Route 1: `/cdn/[...path]` - By Folder Path

**Best for:** Static HTML, predictable file structures

### Format
```
/cdn/{folder}/{filename}
/cdn/{folder}/{subfolder}/{filename}
```

### Examples

```html
<!-- Simple folder + file -->
<img src="/cdn/public/TInHaul_5.webp" alt="Boot" />

<!-- Deep paths work too -->
<img src="/cdn/images/products/hero-banner.jpg" />

<!-- Videos -->
<video src="/cdn/videos/promo.mp4" controls />

<!-- PDFs -->
<a href="/cdn/documents/brochure.pdf">Download</a>
```

### Your Current Files

```html
<!-- Tin Haul Boot -->
<img src="/cdn/public/TInHaul_5.webp" />

<!-- Roper Boot -->
<img src="/cdn/public/Roper_106.avif" />

<!-- Output Image -->
<img src="/cdn/public/2fcd3eb9-af0d-4bec-a83d-6b9277fe1623.jpg-output.png" />
```

### How It Works
1. Request hits `/cdn/public/TInHaul_5.webp`
2. Server looks up file in `documents` table
3. Returns **301 redirect** to Supabase URL
4. Browser caches the redirect (fast!)

---

## 📍 Route 2: `/u/doc/[id]` - By Document ID

**Best for:** Sharing specific files, permalinks

### Format
```
/u/doc/{uuid}
```

### Examples

```html
<!-- Using document UUID -->
<img src="/u/doc/51c8979e-9797-45e0-a871-bcd52d59d0f4" />

<!-- In Next.js -->
<Image src={`/u/doc/${document.id}`} width={500} height={500} />

<!-- Link to download -->
<a href="/u/doc/abc-123-def-456">Download Report</a>
```

### Use Cases
- Sharing files via ID
- Permalinks that don't break when files move
- Database-driven file references

---

## 📍 Route 3: `/u/img/[slug]` - By Friendly Slug

**Best for:** Pretty URLs, marketing pages

### Format
```
/u/img/{slug}
```

### Slug Generation
File names are automatically slugified:
- `TInHaul_5.webp` → `tinhaul-5`
- `Roper_106.avif` → `roper-106`
- `Hero Banner.jpg` → `hero-banner`

### Examples

```html
<!-- Clean, pretty URLs -->
<img src="/u/img/tinhaul-5" alt="Tin Haul Boot" />
<img src="/u/img/roper-106" alt="Roper Boot" />

<!-- Perfect for marketing pages -->
<img src="/u/img/hero-banner" />
<img src="/u/img/product-showcase" />
```

### How Slugs Work
1. System slugifies all image file names
2. Removes extensions, special chars
3. Converts to lowercase with hyphens
4. Matches against your slug

---

## 🎯 Which Route to Use?

| Use Case | Route | Example |
|----------|-------|---------|
| Static HTML with known paths | `/cdn/...` | `<img src="/cdn/public/boot.webp" />` |
| Dynamic content by ID | `/u/doc/...` | `<img src="/u/doc/${id}" />` |
| Pretty marketing URLs | `/u/img/...` | `<img src="/u/img/hero-banner" />` |
| Nested folder structure | `/cdn/...` | `<img src="/cdn/products/boots/hero.jpg" />` |
| Sharing links | `/u/doc/...` | `https://yoursite.com/u/doc/abc-123` |

---

## 🚀 Complete HTML Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Boot Store</title>
  <style>
    .product-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 2rem; 
    }
    img { 
      width: 100%; 
      border-radius: 8px; 
    }
  </style>
</head>
<body>
  <h1>Our Boot Collection</h1>
  
  <div class="product-grid">
    <!-- Using /cdn/folder/file pattern -->
    <div class="product">
      <img src="/cdn/public/TInHaul_5.webp" alt="Tin Haul Boot" />
      <h2>Tin Haul Boot</h2>
      <p>$149.99</p>
    </div>
    
    <!-- Using /u/img/slug pattern -->
    <div class="product">
      <img src="/u/img/roper-106" alt="Roper Boot" />
      <h2>Roper Boot</h2>
      <p>$129.99</p>
    </div>
  </div>
  
  <!-- Download brochure using /cdn pattern -->
  <a href="/cdn/documents/boot-catalog.pdf" download>
    Download Full Catalog (PDF)
  </a>
</body>
</html>
```

---

## ⚡ Performance Features

### 301 Redirects
- Permanent redirects (browsers cache)
- CDN-friendly
- Fast subsequent loads

### Cache Headers
```
Cache-Control: public, max-age=31536000, immutable
```
- Browser caches for 1 year
- Files never change (immutable)
- Blazing fast loads

### Content-Type
- Automatically set from database
- Proper MIME types for all files
- Works with all file types

---

## 🔧 React/Next.js Examples

### Using in Server Component

```tsx
import Image from 'next/image';

export default function ProductPage() {
  return (
    <div>
      {/* CDN path */}
      <Image 
        src="/cdn/public/TInHaul_5.webp"
        width={500}
        height={500}
        alt="Boot"
      />
      
      {/* Slug path */}
      <Image 
        src="/u/img/tinhaul-5"
        width={500}
        height={500}
        alt="Boot"
      />
    </div>
  );
}
```

### Using with Database

```tsx
import { getDocumentsByFolder } from '@/lib/documents';
import Image from 'next/image';

export default async function Gallery() {
  const images = await getDocumentsByFolder('public');
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {images.map(img => (
        <div key={img.id}>
          {/* Option 1: Direct Supabase URL */}
          <Image src={img.url} width={500} height={500} alt={img.name} />
          
          {/* Option 2: CDN route by ID */}
          <Image src={`/u/doc/${img.id}`} width={500} height={500} alt={img.name} />
        </div>
      ))}
    </div>
  );
}
```

---

## 📁 File Structure

```
app/
  cdn/
    [...path]/
      route.ts          ← /cdn/folder/file.jpg
  u/
    doc/
      [id]/
        route.ts        ← /u/doc/abc-123
    img/
      [slug]/
        route.ts        ← /u/img/boot-image
```

---

## 🎊 Benefits

✅ **Clean URLs** - Look like static files  
✅ **301 Redirects** - Browsers cache efficiently  
✅ **Multiple Patterns** - Use what fits your use case  
✅ **No Exposed Supabase URLs** - Your domain only  
✅ **Automatic Discovery** - No hardcoding needed  
✅ **Production Ready** - Cached, fast, reliable  

---

## 🚦 Testing

```bash
# Test CDN route
curl -I http://localhost:3001/cdn/public/TInHaul_5.webp

# Test doc route
curl -I http://localhost:3001/u/doc/51c8979e-9797-45e0-a871-bcd52d59d0f4

# Test img route
curl -I http://localhost:3001/u/img/tinhaul-5
```

All should return **301** redirects to Supabase! ✅

---

## 🎯 Quick Reference

```html
<!-- Three ways to show the same image -->

<!-- 1. CDN path (explicit) -->
<img src="/cdn/public/TInHaul_5.webp" />

<!-- 2. Document ID -->
<img src="/u/doc/51c8979e-9797-45e0-a871-bcd52d59d0f4" />

<!-- 3. Pretty slug -->
<img src="/u/img/tinhaul-5" />
```

**All work. All fast. All cached. Pick your favorite!** 🚀
