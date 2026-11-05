import { Suspense } from "react";
import { eventFormValues } from "@/lib/event-form";
import { CancelEventButton } from "../CancelEventButton";
import { EditEventForm } from "../_components/EditEventForm";
import { getEventCounts, getManagedEvent } from "../data";
import styles from "../settings.module.css";

type Props = PageProps<"/dashboard/events/[slug]/settings">;

async function Settings({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const { event } = await getManagedEvent(slug);
  const counts = await getEventCounts(event.id);

  return (
    <div className={styles.settings}>
      <section className={styles.section} aria-labelledby="details-heading">
        <div>
          <h2 id="details-heading" className={styles.sectionTitle}>
            Details
          </h2>
          <p className={styles.sectionText}>
            Changes show on the public page right away. Attendees aren&apos;t emailed, except anyone moved off the waitlist.
          </p>
        </div>
        {event.cancelled ? (
          <p className={styles.notice}>Cancelled events can&apos;t be edited.</p>
        ) : (
          <EditEventForm slug={event.slug} kind={event.kind} initial={eventFormValues(event)} />
        )}
      </section>

      <section className={styles.dangerZone} aria-labelledby="cancel-heading">
        <div>
          <h2 id="cancel-heading" className={styles.sectionTitle}>
            Cancel event
          </h2>
          <p className={styles.sectionText}>
            {event.cancelled
              ? "This event is cancelled. RSVPs are closed."
              : "Closes RSVPs and emails everyone who is going or waitlisted. The page stays up and says it's cancelled."}
          </p>
        </div>
        {!event.cancelled && (
          <CancelEventButton
            slug={event.slug}
            notifyCount={counts.confirmedCount + counts.waitlistedCount}
          />
        )}
      </section>
    </div>
  );
}

export default function SettingsPage({ params }: Props) {
  return (
    <Suspense>
      <Settings params={params} />
    </Suspense>
  );
}
