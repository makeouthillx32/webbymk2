// components/POS/ProductSearch/index.tsx
"use client";

import { useEffect, useRef } from "react";
import "./styles.scss";

interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;   // shows "X products" when a query is active
  isLoading?: boolean;
  autoFocus?: boolean;
}

export function ProductSearch({
  value,
  onChange,
  placeholder = "Search products, SKUs…",
  resultCount,
  isLoading = false,
  autoFocus = false,
}: ProductSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere in the POS panel to jump to search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasValue = value.length > 0;
  const showCount = hasValue && resultCount != null && !isLoading;

  return (
    <div className="product-search">
      {/* Search icon */}
      <span className="product-search__icon" aria-hidden>
        {isLoading ? (
          <span className="product-search__spinner" />
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </span>

      {/* Input */}
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="product-search__input"
        aria-label="Search products"
      />

      {/* Right side: count badge OR "/" shortcut hint OR clear button */}
      <span className="product-search__right">
        {hasValue ? (
          <>
            {showCount && (
              <span className="product-search__count">
                {resultCount} {resultCount === 1 ? "item" : "items"}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              className="product-search__clear"
              aria-label="Clear search"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </>
        ) : (
          <kbd className="product-search__hint">/</kbd>
        )}
      </span>
    </div>
  );
}