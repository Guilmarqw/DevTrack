import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { DashboardHeader } from "@/components/DashboardHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LeaderboardForm,
  PasswordForm,
  ProfileForm,
} from "./SettingsForms";

export const metadata = { title: "Settings · DevTrack" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

export default async function SettingsPage() {
  const user = await requireUser();

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      role: true,
      createdAt: true,
      showOnLeaderboard: true,
      _count: { select: { projects: true } },
    },
  });

  // The session cookie can outlive the row it describes.
  if (!record) {
    return (
      <>
        <DashboardHeader user={user} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
          <p className="text-sm">This account no longer exists.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <DashboardHeader user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="rise">
          <h1 className="text-xl font-medium tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            {record.email}
            <span className="text-faint"> · </span>
            <span className="text-xs uppercase tracking-wide">
              {record.role}
            </span>
            <span className="text-faint"> · </span>
            joined {dateTime.format(record.createdAt)}
            <span className="text-faint"> · </span>
            {record._count.projects}{" "}
            {record._count.projects === 1 ? "project" : "projects"}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <section className="rise rounded-lg border border-line bg-surface px-5 py-5">
            <h2 className="text-sm font-medium">Appearance</h2>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted">
              Auto follows your operating system. The choice is remembered in
              this browser rather than on the account, so each device can
              differ.
            </p>
            <div className="mt-4">
              <ThemeToggle />
            </div>
          </section>

          <ProfileForm name={record.name ?? ""} />
          <LeaderboardForm show={record.showOnLeaderboard} />
          <PasswordForm />
        </div>
      </main>
    </>
  );
}
