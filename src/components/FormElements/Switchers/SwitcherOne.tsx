import { useState } from "react";

const SwitcherOne = () => {
  const [enabled, setEnabled] = useState<boolean>(false);

  return (
    <div>
      <label
        htmlFor="toggle1"
        className="flex cursor-pointer select-none items-center"
      >
        <div className="relative">
          <input
            type="checkbox"
            id="toggle1"
            className="sr-only"
            onChange={() => {
              setEnabled(!enabled);
            }}
          />
          <div className="block h-8 w-14 rounded-full bg-[hsl(var(--muted))] dark:bg-[hsl(var(--secondary))]"></div>
          <div
            className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[hsl(var(--background))] shadow-[var(--shadow-sm)] transition ${
              enabled && "!right-1 !translate-x-full !bg-[hsl(var(--sidebar-primary))] dark:!bg-[hsl(var(--background))]"
            }`}
          ></div>
        </div>
      </label>
    </div>
  );
};

export default SwitcherOne;