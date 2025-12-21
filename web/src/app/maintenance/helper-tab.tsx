"use client";

import { Building2, CheckCircle2, GraduationCap, Lightbulb, MapPin, Search, XCircle } from "lucide-react";

export function HelperTab() {
  return (
    <div className="flex flex-col gap-6">
      {/* Introduction */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="rounded-t-2xl bg-[var(--brand-gradient-strong)] px-5 py-4">
          <h2 className="text-lg font-bold text-white">Welcome to Maintenance</h2>
          <p className="mt-1 text-sm text-white/80">
            This section helps you manage the people, classes, and rooms used for scheduling.
          </p>
        </div>
        <div className="p-5">
          <p className="text-sm text-foreground/90 leading-relaxed">
            Before you can create schedules, you need to set up three things:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <QuickCard
              icon={<GraduationCap className="h-5 w-5" />}
              title="Instructors"
              description="The people who teach your classes"
            />
            <QuickCard
              icon={<Building2 className="h-5 w-5" />}
              title="Classes"
              description="The types of classes you offer (Yoga, Spin, etc.)"
            />
            <QuickCard
              icon={<MapPin className="h-5 w-5" />}
              title="Locations"
              description="The rooms or studios where classes are held"
            />
          </div>
        </div>
      </div>

      {/* Instructors Guide */}
      <GuideSection
        icon={<GraduationCap className="h-5 w-5" />}
        title="Managing Instructors"
        color="green"
      >
        <StepList>
          <Step number={1} title="Adding a New Instructor">
            <p>Click the yellow <strong>&quot;Add Instructor&quot;</strong> button at the top right.</p>
            <p className="mt-2">Fill in their information:</p>
            <ul className="mt-1 ml-4 list-disc text-foreground/80">
              <li><strong>First Name</strong> and <strong>Last Name</strong> are required</li>
              <li><strong>Nickname</strong> is what appears on the schedule (like &quot;JOHN S&quot; or &quot;SARAH&quot;)</li>
            </ul>
          </Step>

          <Step number={2} title="About Nicknames">
            <p>Nicknames help identify instructors on the printed schedule.</p>
            <p className="mt-2">If the nickname you type is already used by someone else, you will see suggestions like:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <SampleChip>JOHN S</SampleChip>
              <SampleChip>JOHN SM</SampleChip>
              <SampleChip>J SMITH</SampleChip>
            </div>
            <p className="mt-2 text-foreground/70">Click any suggestion to use it, or type your own unique nickname.</p>
          </Step>

          <Step number={3} title="Editing an Instructor">
            <p>Find the instructor in the list and click the <strong>pencil icon</strong> on the right.</p>
            <p className="mt-1 text-foreground/70">Make your changes and click &quot;Save&quot;.</p>
          </Step>

          <Step number={4} title="Removing an Instructor">
            <p>Instead of deleting, click <strong>&quot;Deactivate&quot;</strong> next to their name.</p>
            <p className="mt-1 text-foreground/70">
              This hides them from future schedules but keeps their history for reports.
              You can always reactivate them later.
            </p>
          </Step>
        </StepList>
      </GuideSection>

      {/* Classes Guide */}
      <GuideSection
        icon={<Building2 className="h-5 w-5" />}
        title="Managing Classes"
        color="blue"
      >
        <StepList>
          <Step number={1} title="Adding a New Class">
            <p>Click the yellow <strong>&quot;Add Class&quot;</strong> button at the top right.</p>
            <p className="mt-2">Fill in the details:</p>
            <ul className="mt-1 ml-4 list-disc text-foreground/80">
              <li><strong>Class Name</strong> is required (example: &quot;Power Yoga&quot; or &quot;BODYPUMP&quot;)</li>
              <li><strong>Category</strong> helps group similar classes (like &quot;Cardio&quot; or &quot;Strength&quot;)</li>
              <li><strong>Description</strong> is optional extra information</li>
            </ul>
          </Step>

          <Step number={2} title="Using Trademark Symbols">
            <p>Many fitness classes have trademarked names. To add a symbol:</p>
            <ol className="mt-2 ml-4 list-decimal text-foreground/80">
              <li>Type the class name (like &quot;BODYPUMP&quot;)</li>
              <li>Click the <strong>TM button</strong> next to the name field</li>
              <li>Pick your symbol from the dropdown</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-3">
              <SymbolExample symbol="TM" name="Trademark" example="BODYPUMP" />
              <SymbolExample symbol="R" name="Registered" example="Zumba" />
            </div>
          </Step>

          <Step number={3} title="Editing a Class">
            <p>Find the class in the list and click the <strong>pencil icon</strong> on the right.</p>
          </Step>

          <Step number={4} title="Removing a Class">
            <p>Click <strong>&quot;Deactivate&quot;</strong> to hide a class from future schedules.</p>
            <p className="mt-1 text-foreground/70">
              Past attendance records are preserved for your reports.
            </p>
          </Step>
        </StepList>
      </GuideSection>

      {/* Locations Guide */}
      <GuideSection
        icon={<MapPin className="h-5 w-5" />}
        title="Managing Locations"
        color="purple"
      >
        <StepList>
          <Step number={1} title="Adding a New Location">
            <p>Click the yellow <strong>&quot;Add Location&quot;</strong> button at the top right.</p>
            <p className="mt-2">Fill in both fields:</p>
            <ul className="mt-1 ml-4 list-disc text-foreground/80">
              <li><strong>Code</strong> - A short abbreviation (like &quot;MB&quot; or &quot;STUDIO&quot;)</li>
              <li><strong>Name</strong> - The full name (like &quot;Main Building&quot; or &quot;Yoga Studio&quot;)</li>
            </ul>
          </Step>

          <Step number={2} title="Choosing Good Codes">
            <p>Keep codes short (2-4 letters) so they fit on schedules:</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span><strong>MB</strong> - Main Building</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span><strong>POOL</strong> - Swimming Pool</span>
              </div>
              <div className="flex items-center gap-3">
                <XCircle className="h-4 w-4 text-red-400" />
                <span className="text-foreground/60"><strong>MAINBLDG</strong> - Too long</span>
              </div>
            </div>
          </Step>

          <Step number={3} title="Editing a Location">
            <p>Find the location in the list and click the <strong>pencil icon</strong> on the right.</p>
          </Step>

          <Step number={4} title="Removing a Location">
            <p>Click <strong>&quot;Deactivate&quot;</strong> to hide a location from future schedules.</p>
          </Step>
        </StepList>
      </GuideSection>

      {/* Search Guide */}
      <GuideSection
        icon={<Search className="h-5 w-5" />}
        title="Using the Search Feature"
        color="blue"
      >
        <StepList>
          <Step number={1} title="Finding Items Quickly">
            <p>Use the <strong>Search</strong> box at the top of each tab to find instructors, classes, or locations.</p>
            <p className="mt-2">Just start typing - the search happens as you type.</p>
          </Step>

          <Step number={2} title="Filter Options">
            <p>Choose how the search behaves using the three filter buttons:</p>
            <div className="mt-3 space-y-3">
              <div className="rounded-lg bg-white/5 p-3">
                <div className="font-semibold text-foreground">Narrow</div>
                <p className="mt-1 text-foreground/70">
                  Shows only items that match your search. Non-matching items are hidden from the list.
                </p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <div className="font-semibold text-foreground">Find</div>
                <p className="mt-1 text-foreground/70">
                  Keeps the full list visible but scrolls to and highlights matching items.
                </p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <div className="font-semibold text-foreground">Smart</div>
                <p className="mt-1 text-foreground/70">
                  Combines both: narrows the list to matches AND highlights the best match.
                </p>
              </div>
            </div>
          </Step>

          <Step number={3} title="Search Tips">
            <ul className="ml-4 list-disc text-foreground/80">
              <li>Click a filter option and start typing immediately</li>
              <li>For instructors, search by nickname, first name, or last name</li>
              <li>For classes and locations, search by name</li>
              <li>Clear the search box to see all items again</li>
            </ul>
          </Step>
        </StepList>
      </GuideSection>

      {/* Tips Section */}
      <div className="rounded-2xl border border-[var(--brand)]/30 bg-[var(--brand)]/10 p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Lightbulb className="h-5 w-5 text-[var(--cta)]" />
          Helpful Tips
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-foreground/90">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-[var(--brand)]">-</span>
            <span>Use the <strong>&quot;Show inactive&quot;</strong> checkbox to see items you have deactivated</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-[var(--brand)]">-</span>
            <span>You can reactivate any instructor, class, or location at any time</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-[var(--brand)]">-</span>
            <span>Changes take effect immediately - no need to save or publish</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-[var(--brand)]">-</span>
            <span>Click the <strong>refresh button</strong> next to &quot;Maintenance&quot; if you do not see recent changes</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// Helper components for the guide

function QuickCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)]/20 text-[var(--brand)]">
        {icon}
      </div>
      <div>
        <h4 className="font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-foreground/70">{description}</p>
      </div>
    </div>
  );
}

function GuideSection({
  icon,
  title,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  color: "green" | "blue" | "purple";
  children: React.ReactNode;
}) {
  const colorClasses = {
    green: "bg-green-500/20 text-green-300",
    blue: "bg-blue-500/20 text-blue-300",
    purple: "bg-purple-500/20 text-purple-300",
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 rounded-t-2xl bg-muted px-5 py-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StepList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--cta)] text-sm font-bold text-[var(--cta-foreground)]">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-foreground">{title}</h4>
        <div className="mt-1 text-sm text-foreground/80">{children}</div>
      </div>
    </div>
  );
}

function SampleChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-[var(--brand)]/20 px-3 py-1 text-xs font-medium text-[var(--brand-soft)]">
      {children}
    </span>
  );
}

function SymbolExample({
  symbol,
  name,
  example,
}: {
  symbol: string;
  name: string;
  example: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
      <span className="text-lg font-bold text-[var(--cta)]">{symbol}</span>
      <div className="text-xs">
        <div className="font-medium text-foreground">{name}</div>
        <div className="text-foreground/60">{example}</div>
      </div>
    </div>
  );
}
