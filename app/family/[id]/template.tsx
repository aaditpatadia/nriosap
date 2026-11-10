/** Runs again on every move between sections, so each page enters the same way. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
