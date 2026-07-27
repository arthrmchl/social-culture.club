import { cn } from "@/lib/utils";
import { starParts, formatStars } from "@/lib/rating";

/** Une étoile pleine / à moitié / vide — glyphe unique superposé. */
export function Star({
  fill,
  className,
}: {
  fill: "full" | "half" | "empty";
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-block leading-none", className)}
      aria-hidden
    >
      <span className="text-border">★</span>
      {fill !== "empty" && (
        <span
          className="absolute inset-0 overflow-hidden text-star"
          style={{ width: fill === "half" ? "50%" : "100%" }}
        >
          ★
        </span>
      )}
    </span>
  );
}

/** Affichage en lecture seule d'une note stockée sur 10 (S5). */
export function StarDisplay({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score == null) return null;
  const { full, half } = starParts(score);
  return (
    <span
      className={cn("inline-flex", className)}
      title={`${formatStars(score)} / 5`}
      aria-label={`Note : ${formatStars(score)} sur 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          fill={i < full ? "full" : i === full && half ? "half" : "empty"}
        />
      ))}
    </span>
  );
}
