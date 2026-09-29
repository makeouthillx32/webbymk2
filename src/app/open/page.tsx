// src/app/open/page.tsx
"use client";

import * as React from "react";
import { BookOpen, ExternalLink, Terminal, Copy, Check, Sparkles, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { name: "Architecture", doc: "Architecture", description: "Platform blueprints, contracts, and system topology" },
  { name: "Dev Logs", doc: "Dev Logs", description: "Incident records, feature evolution, and changelogs" },
  { name: "Database", doc: "Database", description: "Supabase schemas, migrations, and indexing strategies" },
  { name: "Core Control Plane", doc: "Core", description: "UNAXIS control plane, runtime services, and container orchestration" },
  { name: "Tank & Tavern", doc: "Tank", description: "Livestream vision engine, director autopilot, and bazaar mechanics" },
  { name: "CITUI & Inking", doc: "CITUI", description: "Constraint plane, layout stability, and terminal UI engines" },
];

export default function OpenKnowledgePage() {
  const [copied, setCopied] = React.useState(false);
  const [selectedDoc, setSelectedDoc] = React.useState<string | null>(null);
  const cliCommand = "npx @inkeep/open-knowledge open vault";

  const copyCommand = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">OpenKnowledge</h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Live CRDT Vault
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              db.unenter.live markdown collaboration and living documentation portal.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyCommand}
            className="text-xs gap-1.5 font-mono"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "ok open vault"}
          </Button>
          <Button
            size="sm"
            onClick={() => window.open("/api/open?redirect=true", "_blank")}
            className="gap-1.5 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Launch Live Session
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full gap-6">
        {/* Quick Launch Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map((sec) => (
            <div
              key={sec.name}
              onClick={() => setSelectedDoc(sec.doc)}
              className="group cursor-pointer rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
            >
              <div className="flex items-center gap-2 font-semibold text-sm group-hover:text-primary">
                <Folder className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                {sec.name}
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {sec.description}
              </p>
            </div>
          ))}
        </div>

        {/* Embedded Live Preview Frame */}
        <div className="flex-1 flex flex-col rounded-xl border bg-card overflow-hidden shadow-sm min-h-[500px]">
          <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/30 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Previewing <span className="font-mono text-foreground font-medium">{selectedDoc ? `vault/${selectedDoc}` : "vault/"}</span></span>
            </div>
            <a
              href={`/api/open?redirect=true${selectedDoc ? `&doc=${encodeURIComponent(selectedDoc)}` : ""}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline flex items-center gap-1 font-medium"
            >
              Pop out full window <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <iframe
            src={`/api/open?redirect=true${selectedDoc ? `&doc=${encodeURIComponent(selectedDoc)}` : ""}`}
            className="w-full flex-1 min-h-[550px] border-none bg-background"
            title="OpenKnowledge Preview"
          />
        </div>
      </div>
    </div>
  );
}
