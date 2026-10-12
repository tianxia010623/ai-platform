import clsx from "clsx";

/** Scrollable content area with the standard page padding. */
export default function PageScroll({ children, width = "max-w-5xl" }: { children: React.ReactNode; width?: string }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-10">
      <div className={clsx("mx-auto", width)}>{children}</div>
    </div>
  );
}
