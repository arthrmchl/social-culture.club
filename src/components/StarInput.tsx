"use client";

import { useState } from "react";
import { Star } from "./Stars";
import { cn } from "@/lib/utils";

/** Sélecteur d'étoiles contrôlé (0,5 à 5 par demi-point) — sans effet de bord. */
export function StarInput({
  value,
  onChange,
  disabled,
  size = "text-2xl",
}: {
  value: number | null;
  onChange: (stars: number | null) => void;
  disabled?: boolean;
  size?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn("flex", size)}
        onMouseLeave={() => setHover(null)}
        role="group"
        aria-label="Noter"
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const full = i + 1;
          const half = i + 0.5;
          const fill = shown >= full ? "full" : shown >= half ? "half" : "empty";
          return (
            <span key={i} className="relative">
              <Star fill={fill} />
              <button
                type="button"
                aria-label={`${half.toString().replace(".", ",")} étoiles`}
                disabled={disabled}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                onMouseEnter={() => setHover(half)}
                onClick={() => onChange(half)}
              />
              <button
                type="button"
                aria-label={`${full} étoiles`}
                disabled={disabled}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                onMouseEnter={() => setHover(full)}
                onClick={() => onChange(full)}
              />
            </span>
          );
        })}
      </div>
      {value != null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="text-xs text-muted hover:text-foreground"
        >
          Effacer
        </button>
      )}
    </div>
  );
}
