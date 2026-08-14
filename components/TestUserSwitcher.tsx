import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { seedCustomers } from '@/lib/data';
import { getActiveCustomerId, setActiveCustomerId, syncUserIdGlobal } from '@/lib/useActiveCustomer';

/**
 * Renders the floating "test user" switcher panel used to change the active
 * customer (localStorage 'nk_active_user') across the whole site. Runs once on
 * mount, on every page, via _app.tsx.
 *
 * Uses the seed list, not the live server-side CUSTOMERS — this is a static,
 * client-bundled dropdown of who's available to switch to, not a display of
 * any one customer's current (possibly edited) profile.
 */
const CUSTOMERS = seedCustomers();

/**
 * Routes where the switcher panel is hidden. It's fixed at bottom-left and
 * covers table rows on the admin page, which has no active-customer concept of
 * its own.
 */
const HIDE_SWITCHER_ON = ['/admin'];

interface NambikkWidget {
  identify: (identity: Record<string, unknown>) => void;
  reset: () => void;
}

declare global {
  interface Window {
    NambikkWidget?: NambikkWidget;
  }
}

/**
 * Rebuilds the chat widget around the newly selected test user.
 *
 * Identity reaches the widget only through the loader's
 * `data-launch-initial-context`, which _app.tsx bakes into the iframe URL at
 * first load — a later identify() cannot retarget a conversation that already
 * exists, and hydration runs once per conversation. So the reliable way to
 * switch users is to reload: _app then re-initialises the loader with the new
 * identity from the start.
 *
 * reset() first, to drop the cached embed token so the fresh load mints one
 * rather than reusing the previous session's. Note this still cannot clear the
 * conversation the widget stores under its own origin — that is the widget's
 * to expose, not something the parent page can reach.
 */
function rebuildWidgetFor(userId: string): void {
  if (!CUSTOMERS[userId]) return;
  try {
    window.NambikkWidget?.reset();
  } catch {
    /* widget not loaded yet — the reload re-initialises it regardless */
  }
  window.location.reload();
}

function updateInfoPanel(userId: string) {
  const c = CUSTOMERS[userId];
  const el = document.getElementById('nk-user-info');
  // user_id is echoed here, not just the name in the dropdown, because it is
  // the exact string the chat widget has to send as identity.user_id — seeing
  // it makes a mismatch obvious instead of silently falling back to base context.
  if (el && c) {
    el.innerHTML = `<b>${userId}</b><br>${c.email}<br>${c.address.city}, ${c.address.state}`;
  }
}

function buildSwitcher() {
  if (document.getElementById('nk-user-switcher')) return;

  const activeId = getActiveCustomerId();
  syncUserIdGlobal(activeId);

  const panel = document.createElement('div');
  panel.id = 'nk-user-switcher';
  panel.innerHTML = [
    '<div id="nk-switcher-label">Test user</div>',
    '<select id="nk-user-select">',
    Object.keys(CUSTOMERS)
      .map((id) => {
        const c = CUSTOMERS[id];
        const sel = id === activeId ? ' selected' : '';
        return `<option value="${id}"${sel}>${c.name} (${id})</option>`;
      })
      .join(''),
    '</select>',
    '<div id="nk-user-info"></div>',
  ].join('');
  document.body.appendChild(panel);

  if (!document.getElementById('nk-user-switcher-style')) {
    const style = document.createElement('style');
    style.id = 'nk-user-switcher-style';
    style.textContent = [
      '#nk-user-switcher {',
      '  position: fixed; bottom: 88px; left: 20px; z-index: 9999;',
      '  background: var(--white, #FFFFFF); color: var(--body, #3E2E22);',
      '  border: 1px solid var(--border, #E2D8CF); border-radius: 4px;',
      '  padding: 14px 16px; font-family: "DM Sans", system-ui, sans-serif;',
      '  font-size: 12px; box-shadow: 0 8px 28px rgba(28,16,8,0.12);',
      '  min-width: 220px;',
      '}',
      '#nk-switcher-label {',
      '  font-family: "Cormorant Garamond", Georgia, serif; font-style: italic;',
      '  font-size: 13px; font-weight: 500; letter-spacing: 0.02em;',
      '  color: var(--accent, #B08450); margin-bottom: 8px;',
      '  padding-bottom: 8px; border-bottom: 1px solid var(--border, #E2D8CF);',
      '}',
      '#nk-user-select {',
      '  width: 100%; background: var(--bg, #FAF8F5); color: var(--dark, #1C1008);',
      '  border: 1px solid var(--border, #E2D8CF); border-radius: 3px;',
      '  padding: 7px 8px; font-size: 12px; font-family: inherit; cursor: pointer;',
      '  appearance: none; -webkit-appearance: none;',
      '  background-image: url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%238A7968\'/%3E%3C/svg%3E");',
      '  background-repeat: no-repeat; background-position: right 10px center;',
      '}',
      '#nk-user-select:focus {',
      '  outline: none; border-color: var(--accent, #B08450);',
      '}',
      '#nk-user-info {',
      '  margin-top: 10px; font-size: 11px; color: var(--muted, #8A7968); line-height: 1.6;',
      '}',
      '#nk-user-info b {',
      '  color: var(--body, #3E2E22); font-weight: 500;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  updateInfoPanel(activeId);

  document.getElementById('nk-user-select')?.addEventListener('change', (e) => {
    const newId = (e.target as HTMLSelectElement).value;
    setActiveCustomerId(newId);
    updateInfoPanel(newId);
    rebuildWidgetFor(newId);
  });
}

export default function TestUserSwitcher() {
  const { pathname } = useRouter();

  useEffect(() => {
    buildSwitcher();
  }, []);

  /**
   * Toggles visibility per route rather than skipping the build on admin.
   *
   * This component is mounted by _app.tsx, outside the page, so it does not
   * remount on client-side navigation — a build-time check would leave the panel
   * on screen when moving from the storefront to /admin, and never bring it back
   * when moving away. The panel is also appended straight to document.body, so
   * React can't unmount it; setting display is what actually works.
   */
  useEffect(() => {
    const panel = document.getElementById('nk-user-switcher');
    if (panel) panel.style.display = HIDE_SWITCHER_ON.includes(pathname) ? 'none' : '';
  }, [pathname]);

  return null;
}
