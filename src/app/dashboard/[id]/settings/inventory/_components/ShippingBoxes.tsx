"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Pencil, Trash2, Star, StarOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface ShippingBox {
  id: string;
  name: string;
  length_in: number;
  width_in: number;
  height_in: number;
  is_default: boolean;
  is_active: boolean;
}

const emptyForm = { name: "", length_in: "", width_in: "", height_in: "" };

export default function ShippingBoxes() {
  const [boxes, setBoxes] = useState<ShippingBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShippingBox | null>(null);
  const [editing, setEditing] = useState<ShippingBox | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchBoxes() {
    const res = await fetch("/api/shipping-boxes");
    const json = await res.json();
    if (json.ok) setBoxes(json.data);
    setLoading(false);
  }

  useEffect(() => { fetchBoxes(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(box: ShippingBox) {
    setEditing(box);
    setForm({
      name: box.name,
      length_in: String(box.length_in),
      width_in: String(box.width_in),
      height_in: String(box.height_in),
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.length_in || !form.width_in || !form.height_in) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      length_in: parseFloat(form.length_in),
      width_in: parseFloat(form.width_in),
      height_in: parseFloat(form.height_in),
    };

    const url = editing ? `/api/shipping-boxes/${editing.id}` : "/api/shipping-boxes";
    const method = editing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!json.ok) {
      setError(json.message || "Failed to save.");
    } else {
      setDialogOpen(false);
      fetchBoxes();
    }
    setSaving(false);
  }

  async function handleSetDefault(box: ShippingBox) {
    await fetch(`/api/shipping-boxes/${box.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    fetchBoxes();
  }

  async function handleDelete(box: ShippingBox) {
    const res = await fetch(`/api/shipping-boxes/${box.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      alert(json.message);
    } else {
      fetchBoxes();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Shipping Boxes</h2>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Box
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : boxes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shipping boxes configured yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-center px-4 py-2.5 font-medium">L × W × H (in)</th>
                <th className="text-center px-4 py-2.5 font-medium">Default</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {boxes.map((box) => (
                <tr key={box.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {box.name}
                    {box.is_default && (
                      <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {box.length_in}" × {box.width_in}" × {box.height_in}"
                  </td>
                  <td className="px-4 py-3 text-center">
                    {box.is_default ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <button
                        onClick={() => handleSetDefault(box)}
                        title="Set as default"
                        className="text-muted-foreground hover:text-foreground mx-auto block"
                      >
                        <StarOff className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(box)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(box)}
                        disabled={box.is_default}
                        title={box.is_default ? "Cannot delete the default box" : "Delete"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Shipping Box" : "Add Shipping Box"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="box-name">Name</Label>
              <Input
                id="box-name"
                placeholder="e.g. Small Poly Mailer"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="box-l">Length (in)</Label>
                <Input
                  id="box-l"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="10"
                  value={form.length_in}
                  onChange={(e) => setForm((f) => ({ ...f, length_in: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="box-w">Width (in)</Label>
                <Input
                  id="box-w"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="13"
                  value={form.width_in}
                  onChange={(e) => setForm((f) => ({ ...f, width_in: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="box-h">Height (in)</Label>
                <Input
                  id="box-h"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="1"
                  value={form.height_in}
                  onChange={(e) => setForm((f) => ({ ...f, height_in: e.target.value }))}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Box"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This shipping box will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}