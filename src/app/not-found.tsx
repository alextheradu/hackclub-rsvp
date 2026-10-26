import buttons from "@/components/buttons.module.css";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Nothing here.</h1>
      <p className={styles.sub}>That event or page doesn&apos;t exist, or the link has a typo.</p>
      <a className={`${buttons.btn} ${buttons.primary}`} href="https://hackclub.rsvp">
        Back to hackclub.rsvp
      </a>
    </main>
  );
}
