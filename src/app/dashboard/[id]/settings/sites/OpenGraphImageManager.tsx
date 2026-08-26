"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ImagePlus, Save, Trash2, Upload, X } from "lucide-react";
import { toast } from "react-hot-toast";
import styles from "./sites.module.css";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AssetInfo = {
  url: string | null;
  alt: string | null;
  bucket: string | null;
  path: string | null;
  updatedAt: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mimeType: string | null;
  originalName: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
};

type Props = {
  zoneKey: string;
  label: string;
  imageUrl: string | null;
  imageAlt: string | null;
  bucket: string | null;
  objectPath: string | null;
  updatedAt: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mimeType: string | null;
  originalName: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  inheritedImageUrl: string | null;
  inheritedImageAlt: string | null;
  inheritedFromLabel: string | null;
};

type SelectedInfo = {
  name: string;
  bytes: number;
  mimeType: string;
  width: number | null;
  height: number | null;
};

function formatBytes(bytes: number | null) {
  if (bytes == null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDimensions(width: number | null, height: number | null) {
  return width && height ? `${width} x ${height}` : "Unknown";
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export default function OpenGraphImageManager(props: Props) {
  const {
    zoneKey,
    label,
    imageUrl,
    imageAlt,
    bucket,
    objectPath,
    updatedAt,
    width,
    height,
    bytes,
    mimeType,
    originalName,
    sourceWidth,
    sourceHeight,
    inheritedImageUrl,
    inheritedImageAlt,
    inheritedFromLabel,
  } = props;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null);
  const [asset, setAsset] = useState<AssetInfo>({
    url: imageUrl,
    alt: imageAlt,
    bucket,
    path: objectPath,
    updatedAt,
    width,
    height,
    bytes,
    mimeType,
    originalName,
    sourceWidth,
    sourceHeight,
  });
  const [alt, setAlt] = useState(imageAlt || `${label} preview`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, busy]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearSelection() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setSelectedInfo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(nextFile: File | null) {
    setError(null);
    if (!nextFile) return;
    if (!ALLOWED_TYPES.has(nextFile.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (nextFile.size > MAX_BYTES) {
      setError("Image must be 8 MB or smaller.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setPreviewUrl(objectUrl);
    setSelectedInfo({
      name: nextFile.name,
      bytes: nextFile.size,
      mimeType: nextFile.type,
      width: null,
      height: null,
    });

    const image = new window.Image();
    image.onload = () => {
      setSelectedInfo((current) =>
        current
          ? {
              ...current,
              width: image.naturalWidth,
              height: image.naturalHeight,
            }
          : current,
      );
    };
    image.src = objectUrl;
  }

  async function saveChanges() {
    if (
      !file &&
      (!asset.url || alt.trim() === (asset.alt || `${label} preview`))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      if (file) {
        const body = new FormData();
        body.set("image", file);
        body.set("alt", alt);
        const response = await fetch(
          `/api/admin/sites/${encodeURIComponent(zoneKey)}/open-graph`,
          {
            method: "POST",
            body,
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Upload failed");
        }

        setAsset({
          url: payload.data.url,
          alt: payload.data.alt,
          bucket: payload.data.bucket,
          path: payload.data.path,
          updatedAt: payload.data.updatedAt,
          width: payload.data.width,
          height: payload.data.height,
          bytes: payload.data.bytes,
          mimeType: payload.data.mimeType,
          originalName: payload.data.originalName,
          sourceWidth: payload.data.sourceWidth,
          sourceHeight: payload.data.sourceHeight,
        });
        setAlt(payload.data.alt);
        clearSelection();
        toast.success(`${label} OpenGraph image updated`);
      } else {
        const response = await fetch(
          `/api/admin/sites/${encodeURIComponent(zoneKey)}/open-graph`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alt }),
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Update failed");
        }
        setAsset((current) => ({ ...current, alt: payload.data.alt }));
        setAlt(payload.data.alt);
        toast.success(`${label} image description updated`);
      }
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (
      !asset.url ||
      !window.confirm(`Remove the OpenGraph image for ${label}?`)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(zoneKey)}/open-graph`,
        {
          method: "DELETE",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Remove failed");
      }
      setAsset({
        url: null,
        alt: null,
        bucket: null,
        path: null,
        updatedAt: null,
        width: null,
        height: null,
        bytes: null,
        mimeType: null,
        originalName: null,
        sourceWidth: null,
        sourceHeight: null,
      });
      setAlt(`${label} preview`);
      clearSelection();
      toast.success(`${label} OpenGraph image removed`);
      router.refresh();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "Remove failed",
      );
    } finally {
      setBusy(false);
    }
  }

  const isInherited = !asset.url && Boolean(inheritedImageUrl);
  const visiblePreview = previewUrl || asset.url || inheritedImageUrl;
  const visibleAlt =
    previewUrl || asset.url
      ? alt || `${label} preview`
      : inheritedImageAlt || `${label} preview`;
  const altChanged = alt.trim() !== (asset.alt || `${label} preview`);
  const canSave = Boolean(file) || Boolean(asset.url && altChanged);

  return (
    <>
      <button
        type="button"
        className={styles.ogTrigger}
        onClick={() => setOpen(true)}
        title={`Manage ${label} OpenGraph image`}
      >
        {visiblePreview ? (
          <>
            <img src={visiblePreview} alt="" className={styles.ogThumb} />
            {isInherited && (
              <span className={styles.inheritedBadge}>Inherited</span>
            )}
          </>
        ) : (
          <span className={styles.ogEmpty}>
            <ImagePlus aria-hidden="true" />
          </span>
        )}
        <span className="sr-only">Manage {label} OpenGraph image</span>
      </button>

      {open && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`og-title-${zoneKey}`}
          >
            <header className={styles.modalHead}>
              <div>
                <h2 id={`og-title-${zoneKey}`}>{label} OpenGraph</h2>
                <span>{zoneKey}</span>
              </div>
              <div className={styles.modalHeadActions}>
                {visiblePreview && (
                  <a
                    href={visiblePreview}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.iconButton}
                    title="Open image"
                  >
                    <ExternalLink aria-hidden="true" />
                    <span className="sr-only">Open image</span>
                  </a>
                )}
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  title="Close"
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </header>

            <div className={styles.specBar}>
              <div>
                <span>Output</span>
                <strong>1200 x 630</strong>
              </div>
              <div>
                <span>Ratio</span>
                <strong>1.91:1</strong>
              </div>
              <div>
                <span>Format</span>
                <strong>JPEG</strong>
              </div>
              <div>
                <span>Maximum</span>
                <strong>8 MB</strong>
              </div>
            </div>

            <div className={styles.ogPreview}>
              {visiblePreview ? (
                <img src={visiblePreview} alt={visibleAlt} />
              ) : (
                <div className={styles.previewEmpty}>
                  <ImagePlus aria-hidden="true" />
                </div>
              )}
            </div>

            {isInherited && !file && (
              <div className={styles.inheritanceNotice}>
                <strong>
                  Inherited from {inheritedFromLabel || "Unenter"}
                </strong>
                <span>
                  Upload an image here to give this site its own preview.
                </span>
              </div>
            )}

            <div
              className={styles.dropZone}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  chooseFile(event.target.files?.[0] || null)
                }
                className={styles.fileInput}
              />
              <button
                type="button"
                className={styles.chooseButton}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus aria-hidden="true" />
                {asset.url
                  ? "Replace image"
                  : isInherited
                    ? "Use own image"
                    : "Choose image"}
              </button>
              <span>
                Minimum 600 x 315. Uploads are cropped and rendered to 1200 x
                630.
              </span>
              {file && (
                <button
                  type="button"
                  className={styles.clearSelection}
                  onClick={clearSelection}
                  title="Clear selected image"
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">Clear selected image</span>
                </button>
              )}
            </div>

            {selectedInfo ? (
              <dl className={styles.assetDetails}>
                <div>
                  <dt>Selected</dt>
                  <dd>{selectedInfo.name}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {formatDimensions(selectedInfo.width, selectedInfo.height)}
                  </dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>
                    {selectedInfo.mimeType.replace("image/", "").toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatBytes(selectedInfo.bytes)}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>1200 x 630 JPEG</dd>
                </div>
                <div>
                  <dt>Fit</dt>
                  <dd>Attention crop</dd>
                </div>
              </dl>
            ) : asset.url ? (
              <>
                <dl className={styles.assetDetails}>
                  <div>
                    <dt>File</dt>
                    <dd>
                      {asset.originalName ||
                        asset.path?.split("/").pop() ||
                        "OpenGraph image"}
                    </dd>
                  </div>
                  <div>
                    <dt>Rendered</dt>
                    <dd>{formatDimensions(asset.width, asset.height)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {formatDimensions(asset.sourceWidth, asset.sourceHeight)}
                    </dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(asset.bytes)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>
                      {asset.mimeType?.replace("image/", "").toUpperCase() ||
                        "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDate(asset.updatedAt)}</dd>
                  </div>
                </dl>
                <div className={styles.storagePath}>
                  <span>Storage</span>
                  <code>
                    {asset.bucket}/{asset.path}
                  </code>
                </div>
              </>
            ) : null}

            <label className={styles.field}>
              <span>Image description</span>
              <input
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                maxLength={300}
                placeholder={`${label} preview`}
                disabled={isInherited && !file}
              />
            </label>

            {error && <div className={styles.inlineError}>{error}</div>}

            <footer className={styles.modalActions}>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={removeImage}
                disabled={busy || !asset.url}
              >
                <Trash2 aria-hidden="true" />
                Delete image
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={saveChanges}
                disabled={busy || !canSave}
              >
                {file ? (
                  <Upload aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {busy ? "Saving..." : file ? "Render and save" : "Save details"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
