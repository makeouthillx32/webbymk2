// app/api/documents/upload/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import sharp from 'sharp';

// Helper to extract image dimensions from File using sharp (server-side)
async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const metadata = await sharp(buffer).metadata();
    
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to extract image dimensions:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folderPath = formData.get("folderPath") as string || "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 50MB." }, { status: 400 });
    }

    // Extract image dimensions if it's an image
    const dimensions = await getImageDimensions(file);

    // Generate unique storage path
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storagePath = folderPath 
      ? `${folderPath}${timestamp}-${safeFileName}`
      : `${timestamp}-${safeFileName}`;

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file to storage" }, { status: 500 });
    }

    // Create document record with image dimensions
    const documentPath = folderPath ? `${folderPath}${file.name}` : file.name;
    const parentPath = folderPath || null;

    const documentData: any = {
      name: file.name,
      path: documentPath,
      parent_path: parentPath,
      type: "file",
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      storage_path: uploadData.path,
      bucket_name: "documents",
      uploaded_by: user.id,
      is_favorite: false,
      is_shared: false,
      visibility: "private",
      tags: []
    };

    // Add dimensions to tags for easy display
    if (dimensions) {
      documentData.tags = [
        `width:${dimensions.width}`,
        `height:${dimensions.height}`,
        `resolution:${dimensions.width}x${dimensions.height}`
      ];
    }

    const { data: document, error: dbError } = await supabase
      .from("documents")
      .insert([documentData])
      .select("*")
      .single();

    if (dbError) {
      console.error("Database insert error:", dbError);
      
      // Clean up uploaded file if database insert fails
      await supabase.storage
        .from("documents")
        .remove([uploadData.path]);
      
      return NextResponse.json({ error: "Failed to create document record" }, { status: 500 });
    }

    // Log upload activity with dimensions
    await supabase
      .from("document_activity")
      .insert([{
        document_id: document.id,
        user_id: user.id,
        activity_type: "uploaded",
        details: {
          file_size: file.size,
          mime_type: file.type,
          ...(dimensions && { 
            width: dimensions.width,
            height: dimensions.height 
          })
        },
        ip_address: req.headers.get("x-forwarded-for")?.split(',')[0] || 
                   req.headers.get("x-real-ip") || null,
        user_agent: req.headers.get("user-agent") || ""
      }]);

    console.log(`📤 Uploaded file: ${file.name} (${file.size} bytes)${dimensions ? ` ${dimensions.width}x${dimensions.height}` : ''} to ${folderPath || 'root'}`);

    // Transform the response to include dimensions for display
    const transformedDocument = {
      id: document.id,
      name: document.name,
      path: document.path,
      type: document.type,
      mime_type: document.mime_type,
      size_bytes: document.size_bytes,
      uploaded_by: document.uploaded_by,
      created_at: document.created_at,
      updated_at: document.updated_at,
      is_favorite: document.is_favorite,
      is_shared: document.is_shared,
      tags: document.tags || [],
      storage_path: document.storage_path,
      bucket_name: document.bucket_name,
      ...(dimensions && { 
        dimensions: `${dimensions.width}x${dimensions.height}`,
        width: dimensions.width,
        height: dimensions.height
      })
    };

    return NextResponse.json(transformedDocument);

  } catch (error) {
    console.error("Upload API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Handle multiple file uploads with image dimensions
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const folderPath = formData.get("folderPath") as string || "";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results = [];
    const errors = [];

    // Process each file
    for (const file of files) {
      try {
        // Validate file size
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          errors.push({
            filename: file.name,
            error: "File too large. Maximum size is 50MB."
          });
          continue;
        }

        // Extract image dimensions
        const dimensions = await getImageDimensions(file);

        // Generate unique storage path
        const timestamp = Date.now();
        const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = folderPath 
          ? `${folderPath}${timestamp}-${safeFileName}`
          : `${timestamp}-${safeFileName}`;

        // Upload file to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          errors.push({
            filename: file.name,
            error: "Failed to upload to storage"
          });
          continue;
        }

        // Create document record
        const documentPath = folderPath ? `${folderPath}${file.name}` : file.name;
        const parentPath = folderPath || null;

        const documentData: any = {
          name: file.name,
          path: documentPath,
          parent_path: parentPath,
          type: "file",
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          storage_path: uploadData.path,
          bucket_name: "documents",
          uploaded_by: user.id,
          is_favorite: false,
          is_shared: false,
          visibility: "private",
          tags: []
        };

        // Add dimensions to tags
        if (dimensions) {
          documentData.tags = [
            `width:${dimensions.width}`,
            `height:${dimensions.height}`,
            `resolution:${dimensions.width}x${dimensions.height}`
          ];
        }

        const { data: document, error: dbError } = await supabase
          .from("documents")
          .insert([documentData])
          .select("*")
          .single();

        if (dbError) {
          console.error("Database insert error:", dbError);
          
          await supabase.storage
            .from("documents")
            .remove([uploadData.path]);
            
          errors.push({
            filename: file.name,
            error: "Failed to create document record"
          });
          continue;
        }

        // Log upload activity
        await supabase
          .from("document_activity")
          .insert([{
            document_id: document.id,
            user_id: user.id,
            activity_type: "uploaded",
            details: {
              file_size: file.size,
              mime_type: file.type,
              ...(dimensions && { 
                width: dimensions.width,
                height: dimensions.height 
              })
            },
            ip_address: req.headers.get("x-forwarded-for")?.split(',')[0] || 
                       req.headers.get("x-real-ip") || null,
            user_agent: req.headers.get("user-agent") || ""
          }]);

        console.log(`📤 Uploaded file: ${file.name} (${file.size} bytes)${dimensions ? ` ${dimensions.width}x${dimensions.height}` : ''} to ${folderPath || 'root'}`);

        const transformedDocument = {
          id: document.id,
          name: document.name,
          path: document.path,
          type: document.type,
          mime_type: document.mime_type,
          size_bytes: document.size_bytes,
          uploaded_by: document.uploaded_by,
          created_at: document.created_at,
          updated_at: document.updated_at,
          is_favorite: document.is_favorite,
          is_shared: document.is_shared,
          tags: document.tags || [],
          storage_path: document.storage_path,
          bucket_name: document.bucket_name,
          ...(dimensions && { 
            dimensions: `${dimensions.width}x${dimensions.height}`,
            width: dimensions.width,
            height: dimensions.height
          })
        };

        results.push(transformedDocument);

      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        errors.push({
          filename: file.name,
          error: "Processing error"
        });
      }
    }

    return NextResponse.json({
      success: true,
      uploaded: results,
      errors: errors,
      summary: {
        total: files.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error("Bulk Upload API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}