import { listPaySchedules, previewPayDates, PAY_FREQUENCIES } from "@/server/pay-schedule";
import { PageHeading } from "@/components/ui";
import { PayScheduleForm, PayScheduleRow } from "./form";

export const dynamic = "force-dynamic";

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every two weeks",
  SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly",
};

export default async function PayPage() {
  const schedules = await listPaySchedules();

  const today = new Date();
  const horizonEnd = new Date(today.getTime() + 120 * 86_400_000);

  const withPreview = schedules.map((schedule) => ({
    schedule,
    label: FREQUENCY_LABELS[schedule.frequency],
    upcoming: previewPayDates(schedule, today, horizonEnd).slice(0, 6),
  }));

  return (
    <div>
      <PageHeading
        title="Pay calendar"
        description="When money is expected to arrive. This is a reference calendar for the projection — it does not decide how the month is divided."
      />

      <PayScheduleForm
        frequencies={PAY_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
      />

      <div className="mt-8 space-y-3">
        {withPreview.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          withPreview.map(({ schedule, label, upcoming }) => (
            <PayScheduleRow
              key={schedule.id}
              schedule={schedule}
              frequencyLabel={label}
              upcoming={upcoming}
            />
          ))
        )}
      </div>

      <p className="mt-6 max-w-prose text-xs text-muted">
        Add a second schedule rather than editing the first when your pay changes.
        Each one records the date it took effect, so past months keep resolving
        against what was true at the time.
      </p>
    </div>
  );
}
