"use client";

import React, { useEffect, useState } from "react";
import { PeptideRequest } from "./types";
import StatusTimeline from "./StatusTimeline";

export default function PeptideRequestsList() {
  const [requests, setRequests] = useState<PeptideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<PeptideRequest | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const url = new URL("/api/peptide-requests", window.location.origin);
      if (statusFilter !== "all") url.searchParams.set("status", statusFilter);
      if (searchQuery.trim()) url.searchParams.set("q", searchQuery.trim());

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.ok) {
        setRequests(data.data);
        if (data.warning) setWarning(data.warning);
      } else {
        setError(data.error || "Failed to load peptide requests");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load peptide requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequests();
  };

  const openDetail = async (req: PeptideRequest) => {
    try {
      const res = await fetch(`/api/peptide-requests/${req.id}`);
      const data = await res.json();
      if (data.ok) {
        setSelectedRequest(data.data);
        setNewStatus(data.data.status);
      } else {
        setSelectedRequest(req);
        setNewStatus(req.status);
      }
    } catch {
      setSelectedRequest(req);
      setNewStatus(req.status);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedRequest || !newStatus || newStatus === selectedRequest.status) return;

    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/peptide-requests/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          changed_by: "Admin User",
          notes: `Status manually updated to ${newStatus}`,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSelectedRequest(data.data);
        fetchRequests();
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner if SQL Migration Not Yet Run in Supabase */}
      {warning && (
        <div className="p-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/30 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <strong>Database Migration Required:</strong> {warning}
          </div>
        </div>
      )}

      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-auto flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by compound, requester, CAS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </form>

        <div className="flex gap-2 w-full sm:w-auto">
          {["all", "new", "in_process", "completed", "rejected"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                statusFilter === st
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading peptide requests...</div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground bg-card rounded-xl border border-border">
          No peptide requests found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="p-3.5">Compound</th>
                <th className="p-3.5">Requester</th>
                <th className="p-3.5">Purity / Qty</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Created</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5 font-semibold text-foreground">
                    {req.compound_name}
                    {req.cas_number && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        CAS: {req.cas_number}
                      </span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <div className="font-medium text-foreground">{req.requester_name}</div>
                    <div className="text-xs text-muted-foreground">{req.requester_email}</div>
                  </td>
                  <td className="p-3.5 text-xs text-muted-foreground">
                    <div>{req.purity_requirement || "N/A"}</div>
                    <div>{req.quantity_requested || "N/A"}</div>
                  </td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize border border-primary/20">
                      {req.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3.5 text-xs text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => openDetail(req)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail & Status Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background max-w-2xl w-full rounded-2xl border border-border p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {selectedRequest.compound_name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">ID: {selectedRequest.id}</p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-muted-foreground hover:text-foreground text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {/* Compound Details Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-xl border border-border">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  Requester
                </span>
                <p className="font-medium text-foreground">{selectedRequest.requester_name}</p>
                <p className="text-xs text-muted-foreground">{selectedRequest.requester_email}</p>
                {selectedRequest.requester_company && (
                  <p className="text-xs text-muted-foreground">{selectedRequest.requester_company}</p>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  Specs
                </span>
                <p className="text-xs text-foreground">
                  CAS: {selectedRequest.cas_number || "N/A"}
                </p>
                <p className="text-xs text-foreground">
                  Formula: {selectedRequest.molecular_formula || "N/A"}
                </p>
                <p className="text-xs text-foreground">
                  MW: {selectedRequest.molecular_weight || "N/A"}
                </p>
              </div>
            </div>

            {/* Change Status Control */}
            <div className="space-y-2 bg-card p-4 rounded-xl border border-border">
              <label className="text-xs font-semibold text-muted-foreground uppercase block">
                Update Status
              </label>
              <div className="flex gap-2">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[
                    "new",
                    "approved",
                    "ordering_standard",
                    "sample_prep_created",
                    "in_process",
                    "completed",
                    "on_hold",
                    "rejected",
                    "cancelled",
                  ].map((st) => (
                    <option key={st} value={st}>
                      {st.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleUpdateStatus}
                  disabled={updatingStatus || newStatus === selectedRequest.status}
                  className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {updatingStatus ? "Saving..." : "Save Status"}
                </button>
              </div>
            </div>

            {/* Status Timeline History */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wide">
                Status Audit Log
              </h4>
              <StatusTimeline history={selectedRequest.history || []} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
