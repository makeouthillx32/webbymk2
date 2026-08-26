// src/zones/docs/Landing.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docs zone landing page · docs.unenter.live
//
// Leads with the unenter.live story and services, then lists every markdown
// doc from src/zones/docs/content/ automatically (drop a .md file → new card).
// The full operator manual lives at /operator (see Page.tsx).
// ─────────────────────────────────────────────────────────────────────────────
import type { Metadata } from "next";
import Link from "next/link";
import { listDocs } from "./markdown";
import styles from "./Page.module.css";

export const metadata: Metadata = {
  title: { absolute: "Unenter Docs | What we build and how we run it" },
  description:
    "unenter.live — a self-hosted app platform run by UNAXIS. What it is, what we offer, and how it's operated.",
};

const pillars = [
  {
    number: "01",
    title: "One platform, many zones",
    description:
      "Every app is an independent zone on unenter.live — built, shipped, and monitored by one operator system.",
  },
  {
    number: "02",
    title: "Self-hosted, fully owned",
    description:
      "Our hardware, our data, our deploys. No rented platform between the code and the internet.",
  },
  {
    number: "03",
    title: "Code + data, nothing else",
    description:
      "Apps ship as immutable images; data lives in restorable snapshots. Everything else is rebuildable on command.",
  },
] as const;

export default function DocsLanding() {
  const docs = listDocs();

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.shell}>
          <nav className={styles.localNav} aria-label="Docs sections">
            <Link className={styles.brand} href="/" aria-label="Unenter Docs home">
              <span className={styles.brandMark} aria-hidden="true">
                U
              </span>
              <span>Unenter Docs</span>
            </Link>
            <ul className={styles.navList}>
              {docs.map((doc) => (
                <li key={doc.slug}>
                  <Link href={`/${doc.slug}`}>{doc.title.split("—")[0].trim()}</Link>
                </li>
              ))}
              <li>
                <Link href="/operator">Operator guide</Link>
              </li>
            </ul>
          </nav>

          <div className={styles.heroGrid}>
            <div>
              <div className={styles.eyebrow}>
                <span className={styles.statusDot} aria-hidden="true" />
                Self-hosted · run by UNAXIS
              </div>
              <h1 id="landing-title">
                One domain. Many apps. Our own hardware.
              </h1>
              <p className={styles.lede}>
                unenter.live is a self-hosted app platform built and operated by
                one developer. Read what it is, what we offer, and how the whole
                thing is run.
              </p>
              <div className={styles.actions}>
                <Link className={styles.primaryAction} href="/unenter">
                  What is unenter.live? <span aria-hidden="true">→</span>
                </Link>
                <Link className={styles.secondaryAction} href="/services">
                  See our services
                </Link>
              </div>
            </div>

            <aside className={styles.operatorCard} aria-label="Platform pillars">
              <p className={styles.cardLabel}>The idea</p>
              <ol>
                {pillars.map((pillar, i) => (
                  <li key={pillar.number}>
                    <span>{i + 1}</span>
                    <div>
                      <strong>{pillar.title}</strong>
                      <p>{pillar.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.guideSection} aria-labelledby="docs-list-title">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionKicker}>Documentation</p>
              <h2 id="docs-list-title">Read the docs.</h2>
            </div>
            <p>
              Every page below is a plain markdown file in the repo — adding a
              new file publishes a new page automatically.
            </p>
          </div>

          <ol className={styles.guideGrid}>
            {docs.map((doc, index) => (
              <li className={styles.availableCard} key={doc.slug}>
                <div className={styles.guideMeta}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.availableStatus}>Available</span>
                </div>
                <h3>{doc.title}</h3>
                <p>{doc.summary}</p>
                <Link href={`/${doc.slug}`}>
                  Read {doc.title.split("—")[0].trim()}{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
            <li className={styles.availableCard} key="operator">
              <div className={styles.guideMeta}>
                <span>{String(docs.length + 1).padStart(2, "0")}</span>
                <span className={styles.availableStatus}>Available</span>
              </div>
              <h3>Operator guide</h3>
              <p>
                The full UNAXIS operator manual — inspect, build, ship, and
                verify the control plane with current evidence.
              </p>
              <Link href="/operator">
                Read the operator guide <span aria-hidden="true">→</span>
              </Link>
            </li>
          </ol>
        </div>
      </section>

      <footer className={styles.pageFooter}>
        <div className={styles.shell}>
          <p>
            Built and operated by Tyler · payments secured by Stripe · powered
            by UNAXIS.
          </p>
          <span>docs.unenter.live</span>
        </div>
      </footer>
    </div>
  );
}
