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

function updateInfoPanel(userId: string) {
  const c = CUSTOMERS[userId];
  const el = document.getElementById('nk-user-info');
  // user_id is echoed here, not just the name in the dropdown, because it is
  // the exact string the chat widget has to send as identity.user_id — seeing
  // it makes a mismatch obvious instead of silently falling back to base context.
  if (el && c) {
    el.innerHTML = `user_id: <b>${userId}</b><br>${c.email}<br>${c.address.city}, ${c.address.state}`;
  }
}

function buildSwitcher() {
  if (document.getElementById('nk-user-switcher')) return;

  const activeId = getActiveCustomerId();
  syncUserIdGlobal(activeId);

  const panel = document.createElement('div');
  panel.id = 'nk-user-switcher';
  panel.innerHTML = [
    '<div id="nk-switcher-label">\u{1F9EA} Test user</div>',
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
      '  position: fixed; bottom: 80px; left: 16px; z-index: 9999;',
      '  background: #1a2433; color: #e8e0d5; border-radius: 10px;',
      '  padding: 10px 14px; font-family: system-ui, sans-serif;',
      '  font-size: 12px; box-shadow: 0 4px 18px rgba(0,0,0,0.4);',
      '  min-width: 210px;',
      '}',
      '#nk-switcher-label {',
      '  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;',
      '  color: #7a9e9f; margin-bottom: 6px;',
      '}',
      '#nk-user-select {',
      '  width: 100%; background: #243040; color: #e8e0d5;',
      '  border: 1px solid #3a5060; border-radius: 6px;',
      '  padding: 5px 8px; font-size: 12px; cursor: pointer;',
      '}',
      '#nk-user-info {',
      '  margin-top: 8px; font-size: 11px; color: #9ab8b9; line-height: 1.5;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  updateInfoPanel(activeId);

  document.getElementById('nk-user-select')?.addEventListener('change', (e) => {
    const newId = (e.target as HTMLSelectElement).value;
    setActiveCustomerId(newId);
    updateInfoPanel(newId);
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
