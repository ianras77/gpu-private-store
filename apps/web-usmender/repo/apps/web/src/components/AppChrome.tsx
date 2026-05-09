'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { clearAuth, readStoredUser, subscribeToAuthChanges, type StoredUser } from '../lib/auth';

const navItems = [
  { href: '/dashboard', label: 'Inbox' },
  { href: '/sessions/new', label: 'New room' },
  { href: '/daily', label: 'Repair' },
  { href: '/settings', label: 'Trust' }
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname.startsWith(href);
}

function initialsFor(user: StoredUser | null) {
  if (!user) return 'U';
  return user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const syncUser = () => setUser(readStoredUser());
    syncUser();
    return subscribeToAuthChanges(syncUser);
  }, []);

  const activeLabel = useMemo(() => {
    const current = navItems.find((item) => isActive(pathname, item.href));
    return current?.label ?? 'Home';
  }, [pathname]);

  function handleSignOut() {
    clearAuth();
    router.push('/');
  }

  return (
    <div className="app-shell">
      <div className="shell-sheen" />
      <div className="ambient ambient-rose" />
      <div className="ambient ambient-sun" />
      <div className="ambient ambient-aqua" />

      <header className="app-header">
        <div className="header-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <span className="brand-mark-inner">U</span>
            </span>
            <span className="brand-copy">
              <strong>USMender</strong>
              <span className="brand-status">
                <span className="status-dot" />
                Mediated messaging
              </span>
            </span>
          </Link>

          <nav className="site-nav desktop-nav" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? 'nav-link active' : 'nav-link'}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="site-actions">
            {user ? (
              <>
                <div className="user-pill">
                  <span className="avatar-badge">{initialsFor(user)}</span>
                  <span>
                    <strong>{user.displayName}</strong>
                    <span>{activeLabel}</span>
                  </span>
                </div>
                <button className="button secondary ghost" type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link className="button secondary ghost" href="/login">
                  Sign in
                </Link>
                <Link className="button primary" href="/login">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="shell-content">{children}</div>

      <nav className="mobile-nav" aria-label="Mobile">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(pathname, item.href) ? 'mobile-link active' : 'mobile-link'}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
