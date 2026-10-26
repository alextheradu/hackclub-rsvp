import styles from "./page.module.css";
import SideRays from "@/components/SideRays/SideRays";

export default function Home() {
  return (
    <div className={styles.page} data-no-overscroll>
      <div className={styles.background}>
        <SideRays
          rayColor1="#ff8fa0"
          rayColor2="#ec3750"
          origin="top-left"
          speed={3.7}
          intensity={2.75}
          spread={2.65}
          density={6}
          followMouse={true}
          blend={0.43}
          sharpness={0.14}
          tilt={8}
          falloff={1.05}
          glow={2}
          saturation={1.1}
          mouseInfluence={0.59}
        />
      </div>
      <div className={styles.scrim} />

      {/* <header className={styles.header}>
        <span className={styles.brand}>
          hackclub<span>.rsvp</span>
        </span>
      </header> */}
      <main className={styles.hero}>
        <h1 className={styles.title}>
          One RSVP for every <em>Hack Club</em> event.
        </h1>
        <p className={styles.lede}>
          Create an event, share the link, and track RSVPs.
        </p>
        <a className={styles.cta} href="/login">
          Sign in with Hack Club
        </a>
      </main>
    </div>
  );
}
