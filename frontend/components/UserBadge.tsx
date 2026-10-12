import clsx from "clsx";

/** Round initial for the signed-in user, styled like the avatar dots. */
export default function UserBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={clsx(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent2-light font-display text-sm font-semibold text-accent2",
        className
      )}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
