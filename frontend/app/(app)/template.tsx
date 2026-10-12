// A template (unlike a layout) remounts on every navigation, so wrapping
// page content in it gives each route a soft fade-up entrance while the
// sidebar in layout.tsx stays put.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 animate-page-in flex-col">{children}</div>;
}
