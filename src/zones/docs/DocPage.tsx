// src/zones/docs/DocPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Renders one markdown doc from src/zones/docs/content/ as a pretty page.
// Statically generated at build time — every .md file becomes /<slug>.
// ─────────────────────────────────────────────────────────────────────────────
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDoc, listDocs } from "./markdown";
import styles from "./Doc.module.css";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return {
    title: { absolute: `${doc.title} | Unenter Docs` },
    description: doc.summary || undefined,
  };
}

export default async function DocPage({ params }: Params) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <div className={styles.docPage}>
      <div className={styles.shell}>
        <nav className={styles.topBar} aria-label="Docs navigation">
          <Link className={styles.backLink} href="/">
            <span aria-hidden="true">←</span> All docs
          </Link>
          <Link className={styles.backLink} href="/operator">
            Operator guide
          </Link>
        </nav>
        <p className={styles.docKicker}>Unenter Docs</p>
        <article
          className={styles.article}
          // Content is authored in-repo (src/zones/docs/content) — trusted.
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
        <footer className={styles.docFooter}>
          docs.unenter.live · edit this page: src/zones/docs/content/{doc.slug}
          .md
        </footer>
      </div>
    </div>
  );
}
