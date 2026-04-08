import React, { ReactNode } from 'react';
import styles from "@/components/shop/_components/IntroBar.module.scss"; 

interface SectionPanelProps {
  currentPage: string;
  children: ReactNode;
  title?: string;
}

export default function SectionPanel({ currentPage, children, title }: SectionPanelProps) {
  // Use page title or fallback to currentPage with first letter capitalized
  const displayTitle = title || currentPage.charAt(0).toUpperCase() + currentPage.slice(1);

  // Skip rendering for the home page
  if (currentPage === "home") return <>{children}</>;

  return (
    <div className={styles.topSection}>
      {/* Ribbon container at the top */}
      <div className={styles.ribbonContainer}>
        <div className={`${styles.ribbon} ${styles.orange}`}>
          <div className={styles.content}>{displayTitle}</div>
        </div>
      </div>

      {/* Main content with underpage styling */}
      <div className={styles.underpage}>
        {children}
      </div>
    </div>
  );
}
