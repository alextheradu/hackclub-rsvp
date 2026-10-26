import type { CurrentUser } from "@/lib/auth";
import buttons from "@/components/buttons.module.css";
import styles from "./TopBar.module.css";

export function TopBar({ user }: { user?: CurrentUser }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarInner}>
        <nav className={styles.nav} aria-label="Main"></nav>
        {user && (
          <div className={styles.account}>
            <span className={styles.accountName}>{user.name || user.email}</span>
            <form method="POST" action="/logout">
              <button type="submit" className={`${buttons.btn} ${buttons.ghost}`}>
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
