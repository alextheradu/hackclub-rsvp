import GradientASCII from "@/components/GradientASCII/GradientASCII";
import styles from "./page.module.css";

const ASCII_COLORS = ["#1a0a0d", "#8a1424", "#ec3750", "#ff8fa0"];

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.background}>
        <GradientASCII colors={ASCII_COLORS} shape="horizon" />
      </div>
      <div className={styles.scrim} />

      <header className={styles.header}>
        <span className={styles.brand}>
          hackclub<span>.rsvp</span>
        </span>
      </header>

      <main className={styles.hero}>
        <h1 className={styles.title}>
          One RSVP for every <em>Hack Club</em> event.
        </h1>
        <p className={styles.lede}>
          Create an event, collect RSVPs, run the waitlist and check people in
          with a QR code.
        </p>
        <a className={styles.cta} href="/login">
          Sign in with Hack Club
        </a>
      </main>
    </div>
  );
}
