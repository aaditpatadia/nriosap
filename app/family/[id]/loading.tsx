export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-2/3" />
      <div className="skeleton h-24" />
      <div className="skeleton h-24" />
      <div className="skeleton h-24" />
    </div>
  );
}
