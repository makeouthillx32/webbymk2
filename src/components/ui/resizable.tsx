"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelContextType {
  orientation: "horizontal" | "vertical";
  registerPanel: (id: string, defaultSize: number) => void;
  panelSizes: Record<string, number>;
  isDragging: boolean;
}

const PanelGroupContext = React.createContext<PanelContextType | null>(null);

export interface ResizablePanelGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  direction?: "horizontal" | "vertical";
  onLayoutChanged?: (layout: number[]) => void;
}

export function ResizablePanelGroup({
  orientation = "horizontal",
  direction,
  className,
  children,
  onLayoutChanged,
  ...props
}: ResizablePanelGroupProps) {
  const effectiveOrientation = direction || orientation;
  const [panelSizes, setPanelSizes] = React.useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = React.useState(false);

  const registerPanel = React.useCallback((id: string, defaultSize: number) => {
    setPanelSizes((prev) => {
      if (prev[id] !== undefined) return prev;
      return { ...prev, [id]: defaultSize };
    });
  }, []);

  return (
    <PanelGroupContext.Provider
      value={{
        orientation: effectiveOrientation,
        registerPanel,
        panelSizes,
        isDragging,
      }}
    >
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-lg border bg-background",
          effectiveOrientation === "horizontal" ? "flex-row" : "flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </PanelGroupContext.Provider>
  );
}

export interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultSize?: string | number;
  collapsedSize?: string | number;
  collapsible?: boolean;
  minSize?: string | number;
  maxSize?: string | number;
  onResize?: (size: { asPercentage: number; inPixels: number }) => void;
}

export function ResizablePanel({
  defaultSize = 30,
  collapsedSize,
  collapsible,
  minSize,
  maxSize,
  onResize,
  className,
  style,
  children,
  ...props
}: ResizablePanelProps) {
  const panelId = React.useId();
  const context = React.useContext(PanelGroupContext);

  const parseSize = (size?: string | number): number => {
    if (typeof size === "number") return size;
    if (typeof size === "string") {
      const parsed = parseFloat(size.replace("%", ""));
      return isNaN(parsed) ? 30 : parsed;
    }
    return 30;
  };

  const parsedDefault = parseSize(defaultSize);

  React.useEffect(() => {
    if (context?.registerPanel) {
      context.registerPanel(panelId, parsedDefault);
    }
  }, [context, panelId, parsedDefault]);

  const flexBasis = typeof defaultSize === "string" && defaultSize.includes("%")
    ? defaultSize
    : `${parsedDefault}%`;

  return (
    <div
      data-panel-id={panelId}
      className={cn("relative flex flex-col min-w-0 min-h-0 overflow-hidden", className)}
      style={{
        flexGrow: parsedDefault,
        flexShrink: 1,
        flexBasis: flexBasis,
        maxWidth: maxSize ? (typeof maxSize === "number" ? `${maxSize}%` : maxSize) : undefined,
        minWidth: minSize ? (typeof minSize === "number" ? `${minSize}%` : minSize) : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ResizableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  withHandle?: boolean;
}

export function ResizableHandle({
  withHandle = false,
  className,
  ...props
}: ResizableHandleProps) {
  const context = React.useContext(PanelGroupContext);
  const isHorizontal = context?.orientation !== "vertical";

  return (
    <div
      role="separator"
      tabIndex={0}
      className={cn(
        "relative flex items-center justify-center bg-border transition-colors hover:bg-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isHorizontal ? "w-px hover:w-1 -mr-px cursor-col-resize" : "h-px hover:h-1 -mb-px cursor-row-resize",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
