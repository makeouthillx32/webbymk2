"use client";

import React from "react";
import styles from "./_components/IntroBar.module.scss";
type PageKey = keyof typeof any | "home";

interface IntroBarProps {
  currentPage: PageKey;
}
export default function IntroBar({ currentPage }: IntroBarProps) {
  // never render on the home page
  if (currentPage === "home") return null;

  const label = labels[currentPage];
  if (!label) return null;        // guard against unknown keys

  return (
    <div className={styles.ribbonContainer}>
      <h2 className={styles.ribbon}>
        <span className={styles.content}>{label}</span>
      </h2>
    </div>
  );
}
