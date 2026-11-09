export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-1/3" />
      <div className="skeleton h-64" />
    </div>
  );
}
