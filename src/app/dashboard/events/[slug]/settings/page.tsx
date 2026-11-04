import { Suspense } from "react";
import { CancelEventButton } from "../CancelEventButton";
import { getEventCounts, getManagedEvent } from "../data";
import styles from "../roster.module.css";

type Props = PageProps<"/dashboard/events/[slug]/settings">;

async function Settings({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const { event } = await getManagedEvent(slug);
  const counts = await getEventCounts(event.id);

  return (
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
  );
}

export default function SettingsPage({ params }: Props) {
  return (
    <Suspense>
      <Settings params={params} />
    </Suspense>
  );
}
