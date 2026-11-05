import buttons from "@/components/buttons.module.css";
import styles from "../not-found.module.css";

export default function DashboardNotFound() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Event not found.</h1>
      <p className={styles.sub}>It doesn&apos;t exist, or you&apos;re not one of its organizers.</p>
      <a className={`${buttons.btn} ${buttons.primary}`} href="/dashboard">
        Your events
      </a>
    </main>
  );
}
