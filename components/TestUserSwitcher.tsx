import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { CUSTOMERS } from '@/lib/data';
import { getActiveCustomerId, setActiveCustomerId } from '@/lib/useActiveCustomer';

/**
 * Ported from elevenlabs-init.js. Boots the ElevenLabs conversational-AI
 * widget and renders the floating "test user" switcher panel used to
 * change the active customer (localStorage 'nk_active_user') across the
 * whole site. Runs once on mount, on every page, via _app.tsx.
 */
/**
 * ElevenLabs agent to mount, from NEXT_PUBLIC_ELEVENLABS_AGENT_ID.
 *
 * Was hardcoded to `agent_2401kwbf2gwwe6e8w10gnkbntctt`, which ElevenLabs now
 * answers for with `agent_not_found` — so every page load fetched a 404 and
 * logged "Cannot fetch config for agent", and no widget ever appeared. A dead id
 * in source is worse than no id: it can only be fixed by editing code, and it
 * makes the console noisy enough to hide real errors.
 *
 * Unset means the widget is skipped entirely — no third-party script, no 404.
 */
const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || '';

let warnedNoAgent = false;

/**
 * Routes where the switcher panel is hidden. It's fixed at bottom-left and
 * covers table rows on the admin page, which has no active-customer concept of
 * its own. The ElevenLabs widget still boots everywhere, so the agent stays
 * reachable while you watch the admin request log.
 */
const HIDE_SWITCHER_ON = ['/admin'];

function bootElevenLabs(userId: string) {
  const customer = CUSTOMERS[userId];
  if (!customer) return;
  if (!AGENT_ID) {
    // info, not error: an unconfigured widget is a valid state for this demo,
    // and shouting about it buries genuine console errors. Once only — this runs
    // again on every customer switch.
    if (!warnedNoAgent) {
      warnedNoAgent = true;
      console.info(
        '[NestKart] Voice agent disabled. Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID to enable the ElevenLabs widget.'
      );
    }
    return;
  }

  const existing = document.querySelector('elevenlabs-convai');
  if (existing) existing.parentNode?.removeChild(existing);

  const widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', AGENT_ID);
  widget.setAttribute(
    'dynamic-variables',
    JSON.stringify({
      customer_id: userId,
      customer_name: customer.name,
      customer_email: customer.email,
    })
  );
  document.body.appendChild(widget);

  if (!document.getElementById('elevenlabs-convai-script')) {
    const s = document.createElement('script');
    s.id = 'elevenlabs-convai-script';
    s.type = 'text/javascript';
    s.async = true;
    s.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    document.body.appendChild(s);
  }
}

function updateInfoPanel(userId: string) {
  const c = CUSTOMERS[userId];
  const el = document.getElementById('nk-user-info');
  if (el && c) el.innerHTML = `${c.email}<br>${c.state}`;
}

function buildSwitcher() {
  if (document.getElementById('nk-user-switcher')) return;

  const activeId = getActiveCustomerId();

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
    bootElevenLabs(newId);
  });
}

export default function TestUserSwitcher() {
  const { pathname } = useRouter();

  useEffect(() => {
    const activeId = getActiveCustomerId();
    bootElevenLabs(activeId);
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
