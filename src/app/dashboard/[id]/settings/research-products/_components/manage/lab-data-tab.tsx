"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import QRCode from "qrcode";
import { FlaskConical, Plus, Trash2, Pencil, ShieldCheck, X, QrCode, Copy, Download, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { safeReadJson } from "../utils";
import type { ProductRow } from "../types";

// Public verify-page domain a vial-label QR code should point at. Lands on
// the full lab-data library for the product (every batch, full
// transparency) with ?batch=<code> so that specific batch is highlighted —
// not just a single isolated COA.
const VERIFY_BASE_URL = "https://labs.unenter.live/verify/product";

function genAccessCode() {
  // Uppercase alphanumeric, ambiguous chars (0/O, 1/I) stripped — mainly
  // scanned, not typed, but keeping it human-safe costs nothing.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Structured COA ("Certificate of Analysis") data — separate from
// research_product_images / research_variant_images (photos, including
// scanned lab-report images). This tab stores analyte results, conformity
// samples, and statistical summaries so the storefront can render/plot the
// data itself instead of just linking a hosted PDF.

type ResultRow = {
  section: string;
  analyte: string;
  limit_spec: string;
  result: string;
  unit: string;
  status: string;
};

type ConformitySample = {
  sample_label: string;
  purity_pct: string;
  net_content_mg: string;
  identification: string;
  result: string;
  is_representative: boolean;
};

type StatRow = {
  metric_name: string;
  mean_value: string;
  std_dev: string;
  unit: string;
};

type FormState = {
  variant_id: string;
  lab_name: string;
  coa_number: string;
  access_code: string;
  verified: boolean;
  pending: boolean;
  product_label: string;
  lot_number: string;
  appearance: string;
  test_type: string;
  date_received: string;
  date_confirmed: string;
  fentanyl_free: boolean;
  fentanyl_test_method: string;
  lab_director_name: string;
  signed_date: string;
  produced_date: string;
  pdf_url: string;
  notes: string;
  methodology: string;
  chromatogram_sample_ref: string;
  results: ResultRow[];
  conformity_samples: ConformitySample[];
  stats: StatRow[];
};

const emptyForm = (): FormState => ({
  variant_id: "",
  lab_name: "",
  coa_number: "",
  access_code: "",
  verified: true,
  pending: false,
  product_label: "",
  lot_number: "",
  appearance: "",
  test_type: "Full QC Panel",
  date_received: "",
  date_confirmed: "",
  fentanyl_free: false,
  fentanyl_test_method: "",
  lab_director_name: "",
  signed_date: "",
  produced_date: "",
  pdf_url: "",
  notes: "",
  methodology: "",
  chromatogram_sample_ref: "",
  results: [],
  conformity_samples: [],
  stats: [],
});

function fieldLabel(text: string) {
  return <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{text}</label>;
}

interface LabDataTabProps {
  detail: ProductRow;
}

export function LabDataTab({ detail }: LabDataTabProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // "new" | report.id | null (list view)
  const [form, setForm] = useState<FormState>(emptyForm());
  const [qrOpenId, setQrOpenId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Raw file the admin just uploaded (the PDF/image the lab sent us) — kept
  // separately from form.pdf_url so "Parse with AI" can re-download the
  // exact same object from storage without the admin re-selecting it.
  const [uploadedFile, setUploadedFile] = useState<{ path: string; contentType: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/research-products/admin/${detail.id}/lab-reports`, {
        cache: "no-store",
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to load COAs");
      setReports(json.data ?? []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to load COAs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  const startCreate = () => {
    setForm(emptyForm());
    setUploadedFile(null);
    setEditingId("new");
  };

  const startEdit = (r: any) => {
    setForm({
      variant_id: r.variant_id ?? "",
      lab_name: r.lab_name ?? "",
      coa_number: r.coa_number ?? "",
      access_code: r.access_code ?? "",
      verified: !!r.verified,
      pending: !!r.pending,
      product_label: r.product_label ?? "",
      lot_number: r.lot_number ?? "",
      appearance: r.appearance ?? "",
      test_type: r.test_type ?? "",
      date_received: r.date_received ?? "",
      date_confirmed: r.date_confirmed ?? "",
      fentanyl_free: !!r.fentanyl_free,
      fentanyl_test_method: r.fentanyl_test_method ?? "",
      lab_director_name: r.lab_director_name ?? "",
      signed_date: r.signed_date ?? "",
      produced_date: r.produced_date ?? "",
      pdf_url: r.pdf_url ?? "",
      notes: r.notes ?? "",
      methodology: r.methodology ?? "",
      chromatogram_sample_ref: r.chromatogram_sample_ref ?? "",
      results: (r.results ?? []).map((x: any) => ({
        section: x.section ?? "",
        analyte: x.analyte ?? "",
        limit_spec: x.limit_spec ?? "",
        result: x.result ?? "",
        unit: x.unit ?? "",
        status: x.status ?? "",
      })),
      conformity_samples: (r.conformity_samples ?? []).map((x: any) => ({
        sample_label: x.sample_label ?? "",
        purity_pct: x.purity_pct != null ? String(x.purity_pct) : "",
        net_content_mg: x.net_content_mg != null ? String(x.net_content_mg) : "",
        identification: x.identification ?? "",
        result: x.result ?? "",
        is_representative: !!x.is_representative,
      })),
      stats: (r.stats ?? []).map((x: any) => ({
        metric_name: x.metric_name ?? "",
        mean_value: x.mean_value != null ? String(x.mean_value) : "",
        std_dev: x.std_dev != null ? String(x.std_dev) : "",
        unit: x.unit ?? "",
      })),
    });
    setUploadedFile(null);
    setEditingId(r.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
    setUploadedFile(null);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/research-products/admin/${detail.id}/lab-reports/upload`, {
        method: "POST",
        body,
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Upload failed");

      setForm((f) => ({ ...f, pdf_url: json.data.url }));
      setUploadedFile({ path: json.data.path, contentType: json.data.contentType, name: file.name });
      toast.success("File uploaded");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const parseWithAI = async () => {
    if (!uploadedFile) return;
    setParsing(true);
    try {
      const res = await fetch(`/api/research-products/admin/${detail.id}/lab-reports/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: uploadedFile.path, contentType: uploadedFile.contentType }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "AI parsing failed");

      const d = json.data;
      const str = (v: any) => (v == null ? "" : String(v));
      setForm((f) => ({
        ...f,
        lab_name: d.lab_name ?? f.lab_name,
        coa_number: d.coa_number ?? f.coa_number,
        product_label: d.product_label ?? f.product_label,
        lot_number: d.lot_number ?? f.lot_number,
        appearance: d.appearance ?? f.appearance,
        test_type: d.test_type ?? f.test_type,
        date_received: d.date_received ?? f.date_received,
        date_confirmed: d.date_confirmed ?? f.date_confirmed,
        signed_date: d.signed_date ?? f.signed_date,
        produced_date: d.produced_date ?? f.produced_date,
        fentanyl_free: typeof d.fentanyl_free === "boolean" ? d.fentanyl_free : f.fentanyl_free,
        fentanyl_test_method: d.fentanyl_test_method ?? f.fentanyl_test_method,
        lab_director_name: d.lab_director_name ?? f.lab_director_name,
        notes: d.notes ?? f.notes,
        methodology: d.methodology ?? f.methodology,
        results: Array.isArray(d.results) && d.results.length
          ? d.results.map((r: any) => ({
              section: str(r.section) || "Results",
              analyte: str(r.analyte),
              limit_spec: str(r.limit_spec),
              result: str(r.result),
              unit: str(r.unit),
              status: str(r.status),
            }))
          : f.results,
        conformity_samples: Array.isArray(d.conformity_samples) && d.conformity_samples.length
          ? d.conformity_samples.map((s: any) => ({
              sample_label: str(s.sample_label),
              purity_pct: str(s.purity_pct),
              net_content_mg: str(s.net_content_mg),
              identification: str(s.identification),
              result: str(s.result),
              is_representative: !!s.is_representative,
            }))
          : f.conformity_samples,
        stats: Array.isArray(d.stats) && d.stats.length
          ? d.stats.map((s: any) => ({
              metric_name: str(s.metric_name),
              mean_value: str(s.mean_value),
              std_dev: str(s.std_dev),
              unit: str(s.unit),
            }))
          : f.stats,
      }));
      toast.success("Filled from AI — review before saving");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "AI parsing failed");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!form.lab_name.trim()) {
      toast.error("Lab name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        variant_id: form.variant_id || null,
        lab_name: form.lab_name.trim(),
        coa_number: form.coa_number.trim() || null,
        access_code: form.access_code.trim() || null,
        verified: form.verified,
        pending: form.pending,
        product_label: form.product_label.trim() || null,
        lot_number: form.lot_number.trim() || null,
        appearance: form.appearance.trim() || null,
        test_type: form.test_type.trim() || null,
        date_received: form.date_received || null,
        date_confirmed: form.date_confirmed || null,
        fentanyl_free: form.fentanyl_free,
        fentanyl_test_method: form.fentanyl_test_method.trim() || null,
        lab_director_name: form.lab_director_name.trim() || null,
        signed_date: form.signed_date || null,
        produced_date: form.produced_date || null,
        pdf_url: form.pdf_url.trim() || null,
        notes: form.notes.trim() || null,
        methodology: form.methodology.trim() || null,
        chromatogram_sample_ref: form.chromatogram_sample_ref.trim() || null,
        results: form.results
          .filter((r) => r.analyte.trim())
          .map((r, i) => ({
            section: r.section.trim() || "Results",
            analyte: r.analyte.trim(),
            limit_spec: r.limit_spec.trim() || null,
            result: r.result.trim() || null,
            unit: r.unit.trim() || null,
            status: r.status.trim() || null,
            position: i,
          })),
        conformity_samples: form.conformity_samples
          .filter((s) => s.sample_label.trim())
          .map((s, i) => ({
            sample_label: s.sample_label.trim(),
            purity_pct: s.purity_pct.trim() ? Number(s.purity_pct) : null,
            net_content_mg: s.net_content_mg.trim() ? Number(s.net_content_mg) : null,
            identification: s.identification.trim() || null,
            result: s.result.trim() || null,
            is_representative: s.is_representative,
            position: i,
          })),
        stats: form.stats
          .filter((s) => s.metric_name.trim())
          .map((s, i) => ({
            metric_name: s.metric_name.trim(),
            mean_value: s.mean_value.trim() ? Number(s.mean_value) : null,
            std_dev: s.std_dev.trim() ? Number(s.std_dev) : null,
            unit: s.unit.trim() || null,
            position: i,
          })),
      };

      const isEdit = editingId && editingId !== "new";
      const url = isEdit
        ? `/api/research-products/admin/${detail.id}/lab-reports/${editingId}`
        : `/api/research-products/admin/${detail.id}/lab-reports`;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to save COA");

      toast.success(isEdit ? "COA updated" : "COA added");
      cancelEdit();
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to save COA");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (reportId: string) => {
    if (!confirm("Delete this COA? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/research-products/admin/${detail.id}/lab-reports/${reportId}`, {
        method: "DELETE",
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to delete");
      toast.success("COA deleted");
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to delete COA");
    }
  };

  const closeQr = () => {
    setQrOpenId(null);
    setQrDataUrl(null);
  };

  const openQr = async (r: any) => {
    if (qrOpenId === r.id) {
      closeQr();
      return;
    }
    setQrOpenId(r.id);
    setQrDataUrl(null);
    setQrLoading(true);
    try {
      let code = r.access_code as string | null;

      // No access code yet — mint one and save it so the QR target is stable
      // (regenerating on every open would print a different code each time).
      if (!code) {
        code = genAccessCode();
        const res = await fetch(
          `/api/research-products/admin/${detail.id}/lab-reports/${r.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_code: code }),
          }
        );
        const json = await safeReadJson(res);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to save access code");
        setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, access_code: code } : x)));
      }

      const url = `${VERIFY_BASE_URL}/${detail.slug}?batch=${code}`;
      // White modules on a transparent background — drops straight onto
      // dark vial-label artwork (Blender renders, etc.) with no background
      // removal step needed before pasting.
      const dataUrl = await QRCode.toDataURL(url, {
        width: 320,
        margin: 1,
        color: {
          dark: "#FFFFFFFF",
          light: "#00000000",
        },
      });
      setQrDataUrl(dataUrl);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to generate QR code");
      closeQr();
    } finally {
      setQrLoading(false);
    }
  };

  const copyVerifyLink = async (code: string) => {
    const url = `${VERIFY_BASE_URL}/${detail.slug}?batch=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — copy it manually");
    }
  };

  const addResult = () =>
    setForm((f) => ({
      ...f,
      results: [
        ...f.results,
        { section: "Full QC Panel", analyte: "", limit_spec: "", result: "", unit: "", status: "" },
      ],
    }));
  const updateResult = (i: number, patch: Partial<ResultRow>) =>
    setForm((f) => ({ ...f, results: f.results.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const removeResult = (i: number) =>
    setForm((f) => ({ ...f, results: f.results.filter((_, idx) => idx !== i) }));

  const addConformity = () =>
    setForm((f) => ({
      ...f,
      conformity_samples: [
        ...f.conformity_samples,
        {
          sample_label: "",
          purity_pct: "",
          net_content_mg: "",
          identification: "",
          result: "",
          is_representative: false,
        },
      ],
    }));
  const updateConformity = (i: number, patch: Partial<ConformitySample>) =>
    setForm((f) => ({
      ...f,
      conformity_samples: f.conformity_samples.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  const removeConformity = (i: number) =>
    setForm((f) => ({ ...f, conformity_samples: f.conformity_samples.filter((_, idx) => idx !== i) }));

  const addStat = () =>
    setForm((f) => ({ ...f, stats: [...f.stats, { metric_name: "", mean_value: "", std_dev: "", unit: "" }] }));
  const updateStat = (i: number, patch: Partial<StatRow>) =>
    setForm((f) => ({ ...f, stats: f.stats.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const removeStat = (i: number) => setForm((f) => ({ ...f, stats: f.stats.filter((_, idx) => idx !== i) }));

  const variants = detail.product_variants ?? [];

  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical size={16} />
            {editingId === "new" ? "Add COA" : "Edit COA"}
          </h3>
          <Button variant="secondary" size="sm" onClick={cancelEdit}>
            <X size={14} className="mr-1" /> Cancel
          </Button>
        </div>

        {/* Header fields */}
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              {fieldLabel("Variant")}
              <select
                value={form.variant_id}
                onChange={(e) => setForm((f) => ({ ...f, variant_id: e.target.value }))}
                className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              >
                <option value="">Whole product (no specific variant)</option>
                {variants.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              {fieldLabel("Lab name *")}
              <Input
                value={form.lab_name}
                onChange={(e) => setForm((f) => ({ ...f, lab_name: e.target.value }))}
                placeholder="e.g. ILS Laboratories"
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Product label on COA")}
              <Input
                value={form.product_label}
                onChange={(e) => setForm((f) => ({ ...f, product_label: e.target.value }))}
                placeholder="e.g. VIP - 10mg"
              />
            </div>

            <div className="space-y-1">
              {fieldLabel("COA number")}
              <Input
                value={form.coa_number}
                onChange={(e) => setForm((f) => ({ ...f, coa_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Access code")}
              <Input
                value={form.access_code}
                onChange={(e) => setForm((f) => ({ ...f, access_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Lot / batch number")}
              <Input
                value={form.lot_number}
                onChange={(e) => setForm((f) => ({ ...f, lot_number: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              {fieldLabel("Appearance")}
              <Input
                value={form.appearance}
                onChange={(e) => setForm((f) => ({ ...f, appearance: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Test type")}
              <Input
                value={form.test_type}
                onChange={(e) => setForm((f) => ({ ...f, test_type: e.target.value }))}
                placeholder="e.g. Full QC Panel"
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              {fieldLabel("CoA file — the PDF/image the lab sent us")}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload size={14} className="mr-1" />
                  {uploading ? "Uploading…" : uploadedFile ? "Replace file" : "Upload file"}
                </Button>
                {(uploadedFile || form.pdf_url) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={parseWithAI}
                    disabled={!uploadedFile || parsing}
                    title={!uploadedFile ? "Upload a file first (a pasted URL alone can't be parsed)" : undefined}
                  >
                    <Sparkles size={14} className="mr-1" />
                    {parsing ? "Parsing…" : "Parse with AI"}
                  </Button>
                )}
                {form.pdf_url && (
                  <a
                    href={form.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[hsl(var(--muted-foreground))] hover:underline truncate max-w-[240px]"
                  >
                    {uploadedFile?.name ?? form.pdf_url}
                  </a>
                )}
              </div>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Uploading pairs the file with this product. "Parse with AI" reads it and tries to fill in
                everything below (dates, results, conformity samples, stats) — review before saving.
              </p>
              <Input
                value={form.pdf_url}
                onChange={(e) => setForm((f) => ({ ...f, pdf_url: e.target.value }))}
                placeholder="…or paste a URL directly"
                className="mt-1"
              />
            </div>

            <div className="space-y-1">
              {fieldLabel("Date received")}
              <Input
                type="date"
                value={form.date_received}
                onChange={(e) => setForm((f) => ({ ...f, date_received: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Date confirmed / tested")}
              <Input
                type="date"
                value={form.date_confirmed}
                onChange={(e) => setForm((f) => ({ ...f, date_confirmed: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Signed date")}
              <Input
                type="date"
                value={form.signed_date}
                onChange={(e) => setForm((f) => ({ ...f, signed_date: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              {fieldLabel("Produced date")}
              <Input
                type="date"
                value={form.produced_date}
                onChange={(e) => setForm((f) => ({ ...f, produced_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Lab director name")}
              <Input
                value={form.lab_director_name}
                onChange={(e) => setForm((f) => ({ ...f, lab_director_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Representative chromatogram sample")}
              <Input
                value={form.chromatogram_sample_ref}
                onChange={(e) => setForm((f) => ({ ...f, chromatogram_sample_ref: e.target.value }))}
                placeholder="e.g. Conformity V1"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-[hsl(var(--border))]">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.verified}
                onChange={(e) => setForm((f) => ({ ...f, verified: e.target.checked }))}
              />
              <ShieldCheck size={14} /> Verified certificate
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.pending}
                onChange={(e) => setForm((f) => ({ ...f, pending: e.target.checked }))}
              />
              Pending — list it, but hide the viewer until data/PDF is ready
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.fentanyl_free}
                onChange={(e) => setForm((f) => ({ ...f, fentanyl_free: e.target.checked }))}
              />
              Confirmed fentanyl free
            </label>
            {form.fentanyl_free && (
              <Input
                value={form.fentanyl_test_method}
                onChange={(e) => setForm((f) => ({ ...f, fentanyl_test_method: e.target.value }))}
                placeholder="Test method, e.g. Immunoassay, 50 ng/mL cutoff"
                className="max-w-xs"
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              {fieldLabel("Notes")}
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-1">
              {fieldLabel("Methodology")}
              <Textarea
                value={form.methodology}
                onChange={(e) => setForm((f) => ({ ...f, methodology: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Test Results</h4>
            <Button type="button" variant="secondary" size="sm" onClick={addResult}>
              <Plus size={14} className="mr-1" /> Add row
            </Button>
          </div>
          {form.results.length === 0 ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              No analyte rows yet — e.g. Peptide Purity (HPLC), Identity, heavy metals, sterility, endotoxin.
            </p>
          ) : (
            <div className="space-y-2">
              {form.results.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-2"
                    placeholder="Section"
                    value={r.section}
                    onChange={(e) => updateResult(i, { section: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Analyte"
                    value={r.analyte}
                    onChange={(e) => updateResult(i, { analyte: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Limit"
                    value={r.limit_spec}
                    onChange={(e) => updateResult(i, { limit_spec: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Result"
                    value={r.result}
                    onChange={(e) => updateResult(i, { result: e.target.value })}
                  />
                  <Input
                    className="col-span-1"
                    placeholder="Unit"
                    value={r.unit}
                    onChange={(e) => updateResult(i, { unit: e.target.value })}
                  />
                  <Input
                    className="col-span-1"
                    placeholder="Status"
                    value={r.status}
                    onChange={(e) => updateResult(i, { status: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeResult(i)}
                    className="col-span-1 text-[hsl(var(--muted-foreground))] hover:text-red-500"
                    aria-label="Remove row"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conformity samples */}
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Conformity Testing Samples</h4>
            <Button type="button" variant="secondary" size="sm" onClick={addConformity}>
              <Plus size={14} className="mr-1" /> Add sample
            </Button>
          </div>
          {form.conformity_samples.length === 0 ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              No samples yet — e.g. Dedicated V0, Conformity V1, Conformity V2.
            </p>
          ) : (
            <div className="space-y-2">
              {form.conformity_samples.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-2"
                    placeholder="Sample label"
                    value={s.sample_label}
                    onChange={(e) => updateConformity(i, { sample_label: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Purity %"
                    value={s.purity_pct}
                    onChange={(e) => updateConformity(i, { purity_pct: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Net content (mg)"
                    value={s.net_content_mg}
                    onChange={(e) => updateConformity(i, { net_content_mg: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Identification"
                    value={s.identification}
                    onChange={(e) => updateConformity(i, { identification: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Result"
                    value={s.result}
                    onChange={(e) => updateConformity(i, { result: e.target.value })}
                  />
                  <label className="col-span-1 flex items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={s.is_representative}
                      onChange={(e) => updateConformity(i, { is_representative: e.target.checked })}
                    />
                    Rep.
                  </label>
                  <button
                    type="button"
                    onClick={() => removeConformity(i)}
                    className="col-span-1 text-[hsl(var(--muted-foreground))] hover:text-red-500"
                    aria-label="Remove sample"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Statistical Summary</h4>
            <Button type="button" variant="secondary" size="sm" onClick={addStat}>
              <Plus size={14} className="mr-1" /> Add metric
            </Button>
          </div>
          {form.stats.length === 0 ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              No metrics yet — e.g. Purity (HPLC), Net Peptide Content, Endotoxin.
            </p>
          ) : (
            <div className="space-y-2">
              {form.stats.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-4"
                    placeholder="Metric name"
                    value={s.metric_name}
                    onChange={(e) => updateStat(i, { metric_name: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Mean"
                    value={s.mean_value}
                    onChange={(e) => updateStat(i, { mean_value: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Std dev"
                    value={s.std_dev}
                    onChange={(e) => updateStat(i, { std_dev: e.target.value })}
                  />
                  <Input
                    className="col-span-1"
                    placeholder="Unit"
                    value={s.unit}
                    onChange={(e) => updateStat(i, { unit: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeStat(i)}
                    className="col-span-1 text-[hsl(var(--muted-foreground))] hover:text-red-500"
                    aria-label="Remove metric"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : editingId === "new" ? "Add COA" : "Save changes"}
          </Button>
          <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FlaskConical size={16} />
          Certificates of Analysis ({reports.length})
        </h3>
        <Button size="sm" onClick={startCreate}>
          <Plus size={14} className="mr-1" /> Add COA
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[hsl(var(--border))] rounded-lg">
          <FlaskConical size={32} className="mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            No COAs yet. Add one to start building the lab-data library for this product.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const variant = variants.find((v: any) => v.id === r.variant_id);
            return (
              <div key={r.id} className="rounded-lg border border-[hsl(var(--border))]">
                <div className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{r.lab_name}</span>
                      {variant && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                          {variant.title}
                        </span>
                      )}
                      {r.verified && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <ShieldCheck size={11} /> Verified
                        </span>
                      )}
                      {r.pending && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          Pending
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                      {[r.coa_number, r.lot_number && `Lot ${r.lot_number}`, r.date_confirmed]
                        .filter(Boolean)
                        .join(" · ") || "No details yet"}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(r.results?.length ?? 0)} results · {(r.conformity_samples?.length ?? 0)} samples ·{" "}
                      {(r.stats?.length ?? 0)} stats
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openQr(r)}
                    className={`shrink-0 ${
                      qrOpenId === r.id
                        ? "text-[hsl(var(--sidebar-primary))]"
                        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    }`}
                    aria-label="Generate QR code"
                    title="Generate verification QR code"
                  >
                    <QrCode size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
                    aria-label="Edit COA"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="text-[hsl(var(--muted-foreground))] hover:text-red-500 shrink-0"
                    aria-label="Delete COA"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {qrOpenId === r.id && (
                  <div className="border-t border-[hsl(var(--border))] p-3 flex items-center gap-4 bg-[hsl(var(--muted)/0.3)]">
                    {qrLoading || !qrDataUrl ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Generating…</p>
                    ) : (
                      <>
                        <img
                          src={qrDataUrl}
                          alt="COA verification QR code"
                          // QR itself is white-on-transparent (for pasting onto label art) —
                          // give the preview a dark backing so it's actually visible here.
                          className="w-24 h-24 rounded border border-[hsl(var(--border))] bg-neutral-800 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-xs text-[hsl(var(--muted-foreground))] break-all">
                            {VERIFY_BASE_URL}/{detail.slug}?batch={r.access_code}
                          </p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Scanning this code opens the full lab-data library for this product —
                            every batch we've tested — highlighted to this exact one. Put it on the
                            vial/kit label.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => copyVerifyLink(r.access_code)}
                            >
                              <Copy size={13} className="mr-1" /> Copy link
                            </Button>
                            <a
                              href={qrDataUrl}
                              download={`coa-qr-${r.access_code}.png`}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
                            >
                              <Download size={13} /> Download PNG
                            </a>
                            <Button type="button" variant="ghost" size="sm" onClick={closeQr}>
                              Close
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
