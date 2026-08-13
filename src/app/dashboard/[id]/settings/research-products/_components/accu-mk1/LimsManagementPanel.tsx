"use client";

import React, { useState } from "react";
import PeptideRequestsList from "./PeptideRequestsList";
import BatchReview from "./batch/BatchReview";
import SampleIntakeModal from "./intake/SampleIntakeModal";
import SubSamplesManager from "./subsamples/SubSamplesManager";
import COAExplorer from "./coa/COAExplorer";
import ClickupUsersAdmin from "./ClickupUsersAdmin";

export default function LimsManagementPanel() {
  const [activeTab, setActiveTab] = useState<
    "requests" | "batches" | "intake" | "subsamples" | "coa" | "clickup"
  >("requests");

  return (
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex border-b border-border space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("requests")}
          className={`py-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "requests"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Peptide Testing Requests
        </button>

        <button
          onClick={() => setActiveTab("batches")}
          className={`py-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "batches"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Batch QC & SLA Tracker
        </button>

        <button
          onClick={() => setActiveTab("intake")}
          className={`py-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "intake"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Sample Intake & Barcodes
        </button>

        <button
          onClick={() => setActiveTab("subsamples")}
          className={`py-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "subsamples"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Vial Powder & Variance QC
        </button>

        <button
          onClick={() => setActiveTab("coa")}
          className={`py-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "coa"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          COA & HPLC Visualizer
        </button>

        <button
          onClick={() => setActiveTab("clickup")}
          className={`py-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === "clickup"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          ClickUp User Mapping
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "requests" && <PeptideRequestsList />}
      {activeTab === "batches" && <BatchReview />}
      {activeTab === "intake" && <SampleIntakeModal />}
      {activeTab === "subsamples" && <SubSamplesManager />}
      {activeTab === "coa" && <COAExplorer />}
      {activeTab === "clickup" && <ClickupUsersAdmin />}
    </div>
  );
}
