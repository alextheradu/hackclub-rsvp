import Image from "next/image";
import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import styles from "./TopBar.module.css";

export type Crumb = { label: string; href?: string };

type Props = {
  user?: CurrentUser;
  crumbs?: Crumb[];
};

export function TopBar({ user, crumbs = [] }: Props) {
  const displayName = user ? user.name || user.email : "";

  return (
    <header className={styles.topbar}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <Link className={styles.logo} href="/dashboard" aria-label="hackclub.rsvp, your events">
            <Image src="/icon-rounded.svg" alt="" width={24} height={24} unoptimized />
            <span className={styles.wordmark}>
              hackclub<span>.rsvp</span>
            </span>
          </Link>

          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className={styles.crumbs}>
              <ol>
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1;
                  return (
                    <li key={`${index}-${crumb.label}`} className={last ? styles.current : undefined}>
                      {crumb.href && !last ? (
                        <Link href={crumb.href}>{crumb.label}</Link>
                      ) : (
                        <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>

        {user && (
          <div className={styles.account}>
            <button
              type="button"
              className={styles.avatar}
              popoverTarget="account-menu"
              aria-label={`Account menu for ${displayName}`}
            >
              {displayName.trim().charAt(0).toUpperCase() || "?"}
            </button>
            <div id="account-menu" popover="auto" className={styles.menu}>
              <div className={styles.menuHead}>
                {user.name && <span className={styles.menuName}>{user.name}</span>}
                <span className={styles.menuEmail}>{user.email}</span>
              </div>
              <Link className={styles.menuItem} href="/dashboard">
                Your events
              </Link>
              <form method="POST" action="/logout">
                <button type="submit" className={styles.menuItem}>
                  Sign out
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
