// components/POS/CustomerEmail/index.tsx
"use client";

import { useState } from "react";
import "./styles.scss";

interface CustomerEmailProps {
  email: string;
  firstName: string;
  lastName: string;
  onEmailChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
}

export function CustomerEmail({
  email,
  firstName,
  lastName,
  onEmailChange,
  onFirstNameChange,
  onLastNameChange,
}: CustomerEmailProps) {
  const [open, setOpen] = useState(false);
  const hasAny = email || firstName || lastName;

  return (
    <div className="cust-info">
      {/* Toggle row */}
      <button
        type="button"
        className={`cust-info__toggle ${hasAny ? "cust-info__toggle--active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="cust-info__toggle-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span className="cust-info__toggle-label">
          Customer info
          <span className="cust-info__toggle-hint">(optional)</span>
        </span>

        {hasAny && (
          <span className="cust-info__badge">
            {[firstName, lastName].filter(Boolean).join(" ") || email}
          </span>
        )}

        <span className={`cust-info__chevron ${open ? "cust-info__chevron--open" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Fields */}
      {open && (
        <div className="cust-info__fields">
          <div className="cust-info__row">
            <div className="cust-info__field">
              <label className="cust-info__label">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => onFirstNameChange(e.target.value)}
                placeholder="Jane"
                className="cust-info__input"
                autoComplete="given-name"
              />
            </div>
            <div className="cust-info__field">
              <label className="cust-info__label">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => onLastNameChange(e.target.value)}
                placeholder="Doe"
                className="cust-info__input"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="cust-info__field">
            <label className="cust-info__label">Email for receipt</label>
            <div className="cust-info__email-wrap">
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="jane@example.com"
                className="cust-info__input"
                autoComplete="email"
              />
              {email && (
                <button
                  type="button"
                  className="cust-info__email-clear"
                  onClick={() => onEmailChange("")}
                  aria-label="Clear email"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}