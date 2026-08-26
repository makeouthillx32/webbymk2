// app/api/research-products/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    // Get query parameters
    // NOTE: research products have no "collections" concept (that's a
    // shop-only feature) — use `category`, a research_categories slug.
    const category = searchParams.get('category');
    const featured = searchParams.get('featured') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20');
    const sort = searchParams.get('sort') || 'newest';
    const q = searchParams.get('q');

    // Start building query
    let query = supabase
      .from('research_products')
      .select(`
        id,
        slug,
        title,
        dosage_label,
        price_cents,
        compare_at_price_cents,
        currency,
        badge,
        is_featured,
        status,
        created_at,
        research_product_images (
          id,
          object_path,
          bucket_name,
          alt_text,
          position,
          is_primary
        )
      `)
      .eq('status', 'active');

    // Filter by category if specified
    if (category) {
      const { data: categoryData } = await supabase
        .from('research_categories')
        .select('id')
        .eq('slug', category)
        .single();

      if (categoryData) {
        const { data: productCategories } = await supabase
          .from('research_product_categories')
          .select('product_id')
          .eq('category_id', categoryData.id);

        if (productCategories && productCategories.length > 0) {
          const productIds = productCategories.map(pc => pc.product_id);
          query = query.in('id', productIds);
        } else {
          // Category has no products
          return NextResponse.json({
            ok: true,
            data: [],
            meta: { count: 0, category }
          });
        }
      } else {
        // Category doesn't exist
        return NextResponse.json({
          ok: true,
          data: [],
          meta: { count: 0, category, error: 'Category not found' }
        });
      }
    }

    // Filter by featured if specified
    if (featured) {
      query = query.eq('is_featured', true);
    }

    // Search by title if query provided
    if (q) {
      query = query.ilike('title', `%${q}%`);
    }

    // Apply sorting
    switch (sort) {
      case 'featured':
        query = query.order('is_featured', { ascending: false });
        break;
      case 'price-asc':
        query = query.order('price_cents', { ascending: true });
        break;
      case 'price-desc':
        query = query.order('price_cents', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Apply limit
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/research-products] Database error:', error);
      return NextResponse.json(
        { ok: false, error: { message: error.message } },
        { status: 500 }
      );
    }

    // Process products to organize images
    const products = (data || []).map((product: any) => {
      const images = (product.research_product_images || [])
        .slice()
        .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

      const primary_image = images.find((img: any) => img.is_primary) || images[0] || null;

      return {
        ...product,
        product_images: images,
        research_product_images: undefined,
        primary_image
      };
    });

    return NextResponse.json({
      ok: true,
      data: products,
      meta: {
        count: products.length,
        category: category || null,
        featured: featured || false,
        sort
      }
    });

  } catch (error: any) {
    console.error('[GET /api/research-products] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: { message: error?.message || 'Failed to fetch products' } },
      { status: 500 }
    );
  }
}