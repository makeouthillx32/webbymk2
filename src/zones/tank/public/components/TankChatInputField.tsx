"use client";

import type { ChangeEvent } from "react";

export type TankChatInputFieldProps = {
  value?: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPasteImage?: (file: File) => void;
};

export function TankChatInputField({
  value = "",
  onChange,
  placeholder,
  disabled,
  className,
  inputRef,
  onKeyDown,
  onPasteImage,
}: TankChatInputFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!onPasteImage) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          onPasteImage(file);
          return;
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        }
      }
    }
  };

  return (
    <div className={`relative min-w-0 ${className ?? "flex-1"}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9 w-full rounded border border-black/60 bg-black/90 px-3 text-xs font-medium text-white placeholder-[#6e737b] shadow-inner outline-none focus:border-yellow-400 disabled:opacity-50"
      />
    </div>
  );
}
export default TankChatInputField;

