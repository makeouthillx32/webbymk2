"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, ExternalLink, Trash2, Upload, X } from "lucide-react";
import { toast } from "react-hot-toast";
import styles from "./sites.module.css";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type IconAsset = {
  url: string | null;
  bucket: string | null;
  path: string | null;
  updatedAt: string | null;
  originalName: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  bytes: number | null;
};

type Props = {
  zoneKey: string;
  label: string;
  imageUrl: string | null;
  bucket: string | null;
  objectPath: string | null;
  updatedAt: string | null;
  originalName: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  bytes: number | null;
  inheritedImageUrl: string | null;
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

export default function SiteIconManager(props: Props) {
  const {
    zoneKey,
    label,
    imageUrl,
    bucket,
    objectPath,
    updatedAt,
    originalName,
    sourceWidth,
    sourceHeight,
    bytes,
    inheritedImageUrl,
    inheritedFromLabel,
  } = props;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null);
  const [asset, setAsset] = useState<IconAsset>({
    url: imageUrl,
    bucket,
    path: objectPath,
    updatedAt,
    originalName,
    sourceWidth,
    sourceHeight,
    bytes,
  });
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

  async function uploadIcon() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(zoneKey)}/icon`,
        { method: "POST", body },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Upload failed");
      }

      setAsset({
        url: payload.data.urls?.icon192 || null,
        bucket: payload.data.bucket,
        path: payload.data.path,
        updatedAt: payload.data.updatedAt,
        originalName: payload.data.originalName,
        sourceWidth: payload.data.sourceWidth,
        sourceHeight: payload.data.sourceHeight,
        bytes: payload.data.bytes,
      });
      clearSelection();
      toast.success(`${label} site icon updated`);
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeIcon() {
    if (!asset.url || !window.confirm(`Remove the site icon for ${label}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(zoneKey)}/icon`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Remove failed");
      }
      setAsset({
        url: null,
        bucket: null,
        path: null,
        updatedAt: null,
        originalName: null,
        sourceWidth: null,
        sourceHeight: null,
        bytes: null,
      });
      clearSelection();
      toast.success(`${label} site icon removed`);
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

  return (
    <>
      <button
        type="button"
        className={styles.iconTrigger}
        onClick={() => setOpen(true)}
        title={`Manage ${label} site icon`}
      >
        {visiblePreview ? (
          <>
            <img src={visiblePreview} alt="" className={styles.iconThumb} />
            {isInherited && (
              <span className={styles.inheritedBadge}>Inherited</span>
            )}
          </>
        ) : (
          <AppWindow aria-hidden="true" />
        )}
        <span className="sr-only">Manage {label} site icon</span>
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
            aria-labelledby={`icon-title-${zoneKey}`}
          >
            <header className={styles.modalHead}>
              <div>
                <h2 id={`icon-title-${zoneKey}`}>{label} site icon</h2>
                <span>{zoneKey}</span>
              </div>
              <div className={styles.modalHeadActions}>
                {visiblePreview && (
                  <a
                    href={visiblePreview}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.iconButton}
                    title="Open icon"
                  >
                    <ExternalLink aria-hidden="true" />
                    <span className="sr-only">Open icon</span>
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
                <span>Browser</span>
                <strong>32 x 32</strong>
              </div>
              <div>
                <span>Apple</span>
                <strong>180 x 180</strong>
              </div>
              <div>
                <span>App</span>
                <strong>192 + 512</strong>
              </div>
              <div>
                <span>Format</span>
                <strong>PNG</strong>
              </div>
            </div>

            <div className={styles.siteIconPreview}>
              {visiblePreview ? (
                <img src={visiblePreview} alt={`${label} site icon`} />
              ) : (
                <AppWindow aria-hidden="true" />
              )}
            </div>

            {isInherited && !file && (
              <div className={styles.inheritanceNotice}>
                <strong>
                  Inherited from {inheritedFromLabel || "Unenter"}
                </strong>
                <span>
                  Upload an icon here to give this site its own identity.
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
                <AppWindow aria-hidden="true" />
                {asset.url
                  ? "Replace icon"
                  : isInherited
                    ? "Use own icon"
                    : "Choose icon"}
              </button>
              <span>
                Square artwork recommended. Minimum 128 x 128, maximum 8 MB.
              </span>
              {file && (
                <button
                  type="button"
                  className={styles.clearSelection}
                  onClick={clearSelection}
                  title="Clear selected icon"
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">Clear selected icon</span>
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
                  <dt>Size</dt>
                  <dd>{formatBytes(selectedInfo.bytes)}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>
                    {selectedInfo.mimeType.replace("image/", "").toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt>Fit</dt>
                  <dd>Square contain</dd>
                </div>
                <div>
                  <dt>Outputs</dt>
                  <dd>4 PNG files</dd>
                </div>
              </dl>
            ) : asset.url ? (
              <>
                <dl className={styles.assetDetails}>
                  <div>
                    <dt>File</dt>
                    <dd>{asset.originalName || "Site icon"}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {formatDimensions(asset.sourceWidth, asset.sourceHeight)}
                    </dd>
                  </div>
                  <div>
                    <dt>Outputs</dt>
                    <dd>32, 180, 192, 512</dd>
                  </div>
                  <div>
                    <dt>Combined</dt>
                    <dd>{formatBytes(asset.bytes)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>PNG</dd>
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

            {error && <div className={styles.inlineError}>{error}</div>}

            <footer className={styles.modalActions}>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={removeIcon}
                disabled={busy || !asset.url}
              >
                <Trash2 aria-hidden="true" />
                Delete icon
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={uploadIcon}
                disabled={busy || !file}
              >
                <Upload aria-hidden="true" />
                {busy ? "Saving..." : "Render and save"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
