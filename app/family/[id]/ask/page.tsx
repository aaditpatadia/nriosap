import Link from "next/link";

export const metadata = { title: "Ally AI" };

export default async function Ask({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = `/family/${id}`;
  return (
    <section className="grid max-w-3xl gap-5">
      <h1 className="text-[length:var(--text-h1)] font-extrabold">Ask Ally</h1>
      <div className="card grid gap-3">
        <span className="chip w-fit" data-tone="warn">Not built yet</span>
        <p className="text-[length:var(--text-h3)] font-semibold">Ask Ally is the next thing we are building.</p>
        <p className="text-muted">It will answer questions from your own documents and requests, and show which document each answer came from. It will not pay, file, sign or decide anything for you.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link className="card lift font-semibold" href={`${base}/documents`}>Search your documents</Link>
        <Link className="card lift font-semibold" href={`${base}/calendar`}>See what is due</Link>
        <Link className="card lift font-semibold" href={`${base}/requests/new`}>Ask your coordinator</Link>
      </div>
    </section>
  );
}
