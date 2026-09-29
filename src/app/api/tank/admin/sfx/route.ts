import { handleAdminSfxDelete, handleAdminSfxPatch, handleAdminSfxPost } from "@/zones/tank/server/audioLibraryAdminHttp";

export const dynamic = "force-dynamic";
export const POST = handleAdminSfxPost;
export const PATCH = handleAdminSfxPatch;
export const PUT = handleAdminSfxPatch;
export const DELETE = handleAdminSfxDelete;
