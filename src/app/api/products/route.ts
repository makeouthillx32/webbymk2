// app/api/products/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    // Get query parameters
    const collection = searchParams.get('collection');
    const featured = searchParams.get('featured') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20');
    const sort = searchParams.get('sort') || 'newest';
    const q = searchParams.get('q');

    // Start building query
    let query = supabase
      .from('products')
      .select(`
        id,
        slug,
        title,
        price_cents,
        compare_at_price_cents,
        currency,
        badge,
        is_featured,
        status,
        created_at,
        product_images (
          id,
          object_path,
          bucket_name,
          alt_text,
          position,
          is_primary
        )
      `)
      .eq('status', 'active');

    // Filter by collection if specified
    if (collection) {
      // Get collection ID from slug
      const { data: collectionData } = await supabase
        .from('collections')
        .select('id')
        .eq('slug', collection)
        .single();

      if (collectionData) {
        // Get product IDs in this collection
        const { data: productCollections } = await supabase
          .from('product_collections')
          .select('product_id')
          .eq('collection_id', collectionData.id);

        if (productCollections && productCollections.length > 0) {
          const productIds = productCollections.map(pc => pc.product_id);
          query = query.in('id', productIds);
        } else {
          // Collection has no products
          return NextResponse.json({
            ok: true,
            data: [],
            meta: { count: 0, collection }
          });
        }
      } else {
        // Collection doesn't exist
        return NextResponse.json({
          ok: true,
          data: [],
          meta: { count: 0, collection, error: 'Collection not found' }
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
      console.error('[GET /api/products] Database error:', error);
      return NextResponse.json(
        { ok: false, error: { message: error.message } },
        { status: 500 }
      );
    }

    // Process products to organize images
    const products = (data || []).map(product => {
      const images = (product.product_images || [])
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      
      const primary_image = images.find(img => img.is_primary) || images[0] || null;

      return {
        ...product,
        primary_image
      };
    });

    return NextResponse.json({
      ok: true,
      data: products,
      meta: {
        count: products.length,
        collection: collection || null,
        featured: featured || false,
        sort
      }
    });

  } catch (error: any) {
    console.error('[GET /api/products] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: { message: error?.message || 'Failed to fetch products' } },
      { status: 500 }
    );
  }
}