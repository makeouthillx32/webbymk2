import { useState } from "react";

const SwitcherTwo = () => {
  const [enabled, setEnabled] = useState(false);

  return (
    <div>
      <label
        htmlFor="toggle2"
        className="flex cursor-pointer select-none items-center"
      >
        <div className="relative">
          <input
            id="toggle2"
            type="checkbox"
            className="sr-only"
            onChange={() => {
              setEnabled(!enabled);
            }}
          />
          <div className="h-5 w-14 rounded-full bg-[hsl(var(--muted))] dark:bg-[hsl(var(--secondary))]"></div>
          <div
            className={`dot shadow-[var(--shadow-md)] absolute -top-1 left-0 h-7 w-7 rounded-full bg-[hsl(var(--background))] transition ${
              enabled && "!right-0 !translate-x-full !bg-[hsl(var(--sidebar-primary))] dark:!bg-[hsl(var(--background))]"
            }`}
          ></div>
        </div>
      </label>
    </div>
  );
};

export default SwitcherTwo;