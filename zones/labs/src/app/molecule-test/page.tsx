import { MoleculeViewport } from "@/components/research/MoleculeViewport";
import { parseDrawioMolecule } from "@/components/research/molecule-drawio";
import { getResearchProductMoleculeXml } from "@/data/research-product-molecules";

export default function MoleculeTestPage() {
  const examples = [
    { name: "NAD+", slug: "nadplus-500mg" },
    { name: "Reduced glutathione", slug: "glutathione-1000mg" },
    { name: "5-Amino-1MQ", slug: "5-amino-1mq-10mg" },
  ];
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-16 text-[hsl(var(--foreground))]">
      <h1 className="mb-8 text-2xl font-bold">Theme-aware molecule viewport</h1>
      <div className="space-y-16">
        {examples.map((example) => (
          <section key={example.slug}>
            <h2 className="mb-5 text-lg font-semibold">{example.name}</h2>
            <MoleculeViewport
              drawing={parseDrawioMolecule(getResearchProductMoleculeXml(example.slug))}
              label={`${example.name} chemical structure`}
              color="primary"
            />
          </section>
        ))}
      </div>
    </main>
  );
}
