import type { EventSummary } from "@/lib/events";
import { EventListSkeleton, EventListView } from "../dashboard/_components/EventList";
import { TopBar } from "../dashboard/_components/TopBar";
import styles from "../dashboard/page.module.css";

const NOW = new Date("2026-11-03T18:00:00Z");
const d = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
let id = 0;
function ev(p: Partial<EventSummary>): EventSummary {
  id += 1;
  return {
    id,
    slug: `e${id}`,
    title: "Event",
    kind: "irl",
    startsAt: d(48),
    endsAt: null,
    timezone: "America/New_York",
    orgName: "Hack Club",
    cancelled: false,
    capacity: null,
    confirmedCount: 0,
    waitlistedCount: 0,
    ...p,
  };
}

const EVENTS = [
  ev({ title: "Counterspell Boston", startsAt: d(-2), endsAt: d(20), capacity: 120, confirmedCount: 74 }),
  ev({ title: "Scrapyard Toronto: a very long event name that keeps going and going", startsAt: d(240), capacity: 50, confirmedCount: 50, waitlistedCount: 12, timezone: "America/Toronto" }),
  ev({ title: "Athena Award", kind: "ysws", startsAt: d(400), confirmedCount: 431, orgName: "Hack Club HQ" }),
  ev({ title: "Club leaders call", startsAt: d(30), capacity: 40, confirmedCount: 34, waitlistedCount: 0 }),
  ev({ title: "Days of Service", startsAt: d(-700), endsAt: d(-690), capacity: 30, confirmedCount: 28 }),
  ev({ title: "Winter hack night", startsAt: d(100), cancelled: true, capacity: 20, confirmedCount: 9 }),
];

export default async function Preview({ searchParams }: PageProps<"/ui-preview">) {
  const { show, empty } = await searchParams;
  const tab = show === "past" || show === "cancelled" ? show : "upcoming";
  return (
    <div className={styles.page}>
      <TopBar
        crumbs={[{ label: "Events" }]}
        user={{ id: 1, hcaId: "x", email: "alex@example.com", name: "Alex Radu", slackId: "U1", avatarUrl: "/icon-rounded.svg", yswsEligible: true }}
      />
      <main className={styles.column}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Your events</h1>
        </div>
        {show === "skeleton" ? <EventListSkeleton /> : <EventListView events={empty ? [] : EVENTS} tab={tab} now={NOW} />}
      </main>
    </div>
  );
}
