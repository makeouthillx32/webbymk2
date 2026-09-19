import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

type ManifestCluster = {
  clusterKey: string;
  detectedClass: "person" | "cat" | "dog";
  sampleCount: number;
  modelKey: string;
  embeddingLength: number;
  centroid: number[];
  representativeCropPath: string;
  sourceRefs: unknown[];
};
type DatasetSample = { sampleId: string; targetSlug: string; clusterKey: string; cropPath: string };
type ReviewDecision = { clusterKey: string; suggestedTargetSlug?: string | null };
type Proposal = { clusterKey: string; candidateSlug: string; score: number };

const workspace = process.cwd();
const manifestPath = join(workspace, ".temp", "tank-identity-profiles", "manifest.json");
const datasetPath = join(workspace, ".temp", "tank-identity-expanded-pass1", "dataset-index.json");
const reviewPath = join(workspace, ".temp", "tank-identity-profiles", "chatgpt-enrollment-review.json");
const hostRoot = process.env.TANK_IDENTITY_HOST_CROP_ROOT || "V:\\tank-archive\\identity-crops";
const containerRoot = process.env.TANK_IDENTITY_CROP_ROOT || "/archive/identity-crops";

function localPath(value: string): string {
  return isAbsolute(value) ? value : resolve(workspace, value);
}

async function copyPrivateCrop(source: string, kind: "clusters" | "samples", name: string): Promise<string> {
  const destination = join(hostRoot, kind, name);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(localPath(source), destination);
  return `${containerRoot}/${kind}/${name}`.replaceAll("\\", "/");
}

async function main() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://db.unenter.live";
  // This importer runs on the Windows host, where Docker-only hostnames such
  // as kong:8000 do not resolve. The app itself keeps using its internal URL.
  const url = configuredUrl.includes("kong:8000") ? "https://db.unenter.live" : configuredUrl;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [manifest, dataset, review] = await Promise.all([
    readFile(manifestPath, "utf8").then((value) => JSON.parse(value) as { generatedAt: string; clusters: ManifestCluster[] }),
    readFile(datasetPath, "utf8").then((value) => JSON.parse(value) as { samples: DatasetSample[]; unconfirmedSimilarityProposals?: Proposal[] }),
    readFile(reviewPath, "utf8").then((value) => JSON.parse(value) as { decisions: ReviewDecision[] }),
  ]);

  const samplesByCluster = new Map<string, DatasetSample[]>();
  for (const sample of dataset.samples) {
    const entries = samplesByCluster.get(sample.clusterKey) ?? [];
    entries.push(sample);
    samplesByCluster.set(sample.clusterKey, entries);
  }
  const decisions = new Map(review.decisions.map((entry) => [entry.clusterKey, entry.suggestedTargetSlug ?? null]));
  const proposals = new Map((dataset.unconfirmedSimilarityProposals ?? []).map((entry) => [entry.clusterKey, entry]));

  const clusterRows = [];
  for (const cluster of manifest.clusters) {
    const samples = samplesByCluster.get(cluster.clusterKey) ?? [];
    const targets = [...new Set(samples.map((sample) => sample.targetSlug))];
    const confirmedTarget = targets.length === 1 ? targets[0] : null;
    const proposal = proposals.get(cluster.clusterKey);
    const representative = await copyPrivateCrop(cluster.representativeCropPath, "clusters", basename(cluster.representativeCropPath));
    clusterRows.push({
      cluster_key: cluster.clusterKey,
      detected_class: cluster.detectedClass,
      status: confirmedTarget ? "confirmed" : "pending",
      assigned_target_slug: confirmedTarget,
      suggested_target_slug: confirmedTarget ?? decisions.get(cluster.clusterKey) ?? proposal?.candidateSlug ?? null,
      suggestion_confidence: confirmedTarget ? 1 : proposal?.score ?? null,
      centroid: cluster.centroid,
      embedding_length: cluster.embeddingLength,
      sample_count: Math.max(cluster.sampleCount, samples.length),
      model_key: cluster.modelKey,
      representative_crop_path: representative,
      source_refs: cluster.sourceRefs,
      first_seen_at: manifest.generatedAt,
      last_seen_at: manifest.generatedAt,
      updated_at: new Date().toISOString(),
    });
  }

  // Import is idempotent and never overwrites a human's later review choice.
  const { error: clusterError } = await supabase.from("tank_identity_clusters").upsert(clusterRows, { onConflict: "cluster_key", ignoreDuplicates: true });
  if (clusterError) throw new Error(`Cluster import failed: ${clusterError.message}`);

  for (const sample of dataset.samples) {
    const copied = await copyPrivateCrop(sample.cropPath, "samples", basename(sample.cropPath));
    const { error } = await supabase.from("tank_identity_training_samples").update({ crop_path: copied }).eq("sample_id", sample.sampleId);
    if (error) throw new Error(`Sample ${sample.sampleId} path update failed: ${error.message}`);
  }

  process.stdout.write(`Imported ${clusterRows.length} review clusters and staged ${dataset.samples.length} private sample crops.\n`);
}

await main();
