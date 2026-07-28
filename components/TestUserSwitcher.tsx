import { useEffect } from 'react';
import { CUSTOMERS } from '@/lib/data';
import { getActiveCustomerId, setActiveCustomerId } from '@/lib/useActiveCustomer';

/**
 * Ported from elevenlabs-init.js. Boots the ElevenLabs conversational-AI
 * widget and renders the floating "test user" switcher panel used to
 * change the active customer (localStorage 'nk_active_user') across the
 * whole site. Runs once on mount, on every page, via _app.tsx.
 */
const AGENT_ID = 'agent_2401kwbf2gwwe6e8w10gnkbntctt';

function bootElevenLabs(userId: string) {
  const customer = CUSTOMERS[userId];
  if (!customer) return;

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
  useEffect(() => {
    const activeId = getActiveCustomerId();
    bootElevenLabs(activeId);
    buildSwitcher();
  }, []);

  return null;
}
