"use client";

import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  owner: {
    grip:
      "border-warm-cream1 bg-white text-warm-text hover:bg-warm-cream2 active:cursor-grabbing",
    arrow:
      "border-warm-cream1 bg-white text-warm-text shadow-sm hover:bg-warm-cream2 disabled:cursor-not-allowed disabled:opacity-35",
  },
  editor: {
    grip:
      "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:cursor-grabbing",
    arrow:
      "border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35",
  },
} as const;

export type ServiceReorderRowVariant = keyof typeof variants;

type Props = {
  index: number;
  total: number;
  /** Accessible name for the row (usually service name). */
  rowLabel: string;
  variant: ServiceReorderRowVariant;
  /** Move by one step (arrow buttons). */
  onMoveStep: (direction: -1 | 1) => void;
  /** Move item from `fromIndex` to `toIndex` (drag-and-drop). */
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: ReactNode;
};

export function ServiceReorderRow({
  index,
  total,
  rowLabel,
  variant,
  onMoveStep,
  onReorder,
  children,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const st = variants[variant];

  function handleDragStart(e: React.DragEvent) {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragEnd() {
    setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (Number.isNaN(from) || from === index) return;
    onReorder(from, index);
  }

  return (
    <div
      className={cn("flex items-start gap-2 sm:gap-3", isDragging && "opacity-55")}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex shrink-0 items-center gap-1 pt-2.5">
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          role="button"
          tabIndex={0}
          aria-label={`Drag to reorder ${rowLabel}`}
          title="Drag to reorder"
          className={cn(
            "flex h-9 w-7 cursor-grab select-none items-center justify-center rounded-lg border shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2",
            variant === "owner" ? "focus-visible:ring-pop-pink/50" : "focus-visible:ring-amber-500/40",
            st.grip,
          )}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowUp" && index > 0) {
              ev.preventDefault();
              onMoveStep(-1);
            }
            if (ev.key === "ArrowDown" && index < total - 1) {
              ev.preventDefault();
              onMoveStep(1);
            }
          }}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </div>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            aria-label={`Move ${rowLabel} up`}
            disabled={index === 0}
            onClick={() => onMoveStep(-1)}
            className={cn("flex h-[17px] w-7 items-center justify-center rounded-md text-xs font-black", st.arrow)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${rowLabel} down`}
            disabled={index === total - 1}
            onClick={() => onMoveStep(1)}
            className={cn("flex h-[17px] w-7 items-center justify-center rounded-md text-xs font-black", st.arrow)}
          >
            ↓
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
