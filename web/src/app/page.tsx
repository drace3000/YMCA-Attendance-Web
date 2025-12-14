export default function Home() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative isolate overflow-hidden bg-[var(--brand-gradient-strong)] px-6 py-10 text-white sm:px-10">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white/10 to-transparent blur-3xl" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide">Welcome</p>
              <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                YMCA Attendance & Scheduling
              </h1>
              <p className="max-w-2xl text-sm sm:text-base text-white/85">
                Jump into reports or set up your branch theme. The dashboard keeps your
                attendance insights front and center.
              </p>
            </div>
            <div className="flex gap-3">
              <a
                href="/reports"
                className="btn-pill bg-[var(--cta)] px-6 py-2 text-sm font-extrabold text-[var(--cta-foreground)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                Start
              </a>
              <a
                href="/settings"
                className="btn-pill border border-white/35 bg-white/10 px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15"
              >
                Settings
              </a>
            </div>
          </div>
        </div>
        <div className="grid gap-4 bg-card px-6 py-6 sm:grid-cols-3 sm:px-8">
          <InfoTile
            title="Reports"
            description="Monthly totals, class type averages, groups, Saturday averages."
            href="/reports"
            pill="Live"
          />
          <InfoTile
            title="Attendance Logs"
            description="Filter by date, instructor, class type, location."
            pill="Coming soon"
          />
          <InfoTile
            title="Scheduling"
            description="Create and publish schedules; manage conflicts."
            pill="Coming soon"
          />
        </div>
      </section>
    </div>
  );
}

function InfoTile({
  title,
  description,
  href,
  pill,
}: {
  title: string;
  description: string;
  href?: string;
  pill?: string;
}) {
  const Content = (
    <div className="group h-full rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {pill ? (
          <span className="rounded-full bg-[var(--brand-soft)]/30 px-3 py-1 text-xs font-semibold text-[var(--brand-strong)]">
            {pill}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block h-full">
        {Content}
      </a>
    );
  }
  return Content;
}
