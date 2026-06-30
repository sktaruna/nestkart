// ─────────────────────────────────────────────────────────────────────────────
// NestKart — Intercom Initialisation + Test User Switcher
// Include this script on every HTML page, just before </body>
// ─────────────────────────────────────────────────────────────────────────────

(function () {

  // ── 1. TEST CUSTOMERS ──────────────────────────────────────────────────────
  // Matches app.py CUSTOMERS data exactly.
  // Add/edit customers here; all pages update automatically.

  var CUSTOMERS = {
    cust_001: { name: "Priya Sharma",  email: "taruna2004126@gmail.com",       state: "NY" },
    cust_002: { name: "Arjun Mehta",   email: "11182tarunask@gmail.com",       state: "CA" },
    cust_003: { name: "Kavitha Nair",  email: "tarunask.1806@gmail.com",       state: "TX" },
    cust_004: { name: "Rohit Verma",   email: "taruna.stockmarket@gmail.com",  state: "AK" },
    cust_005: { name: "Anika Rossi",   email: "taruna2210569@ssn.edu.in",      state: "CA" },
  };

  var APP_ID = "u6tskbxz";
  var STORAGE_KEY = "nk_active_user";

  // ── 2. RESOLVE ACTIVE USER ─────────────────────────────────────────────────
  // Reads from localStorage so selection persists across pages.

  function getActiveUserId() {
    return localStorage.getItem(STORAGE_KEY) || "cust_001";
  }

  function setActiveUser(id) {
    localStorage.setItem(STORAGE_KEY, id);
  }

  // ── 3. BOOT / REBOOT INTERCOM ──────────────────────────────────────────────

  function bootIntercom(userId) {
    var customer = CUSTOMERS[userId];
    if (!customer) return;

    // Shut down any existing session first (important when switching users)
    if (window.Intercom) {
      window.Intercom("shutdown");
    }

    window.intercomSettings = {
      app_id:  APP_ID,
      user_id: userId,
      name:    customer.name,
      email:   customer.email,
    };

    // Load the Intercom widget script if not already present
    if (!document.getElementById("intercom-script")) {
      var s = document.createElement("script");
      s.id   = "intercom-script";
      s.type = "text/javascript";
      s.async = true;
      s.src  = "https://widget.intercom.io/widget/" + APP_ID;
      document.body.appendChild(s);

      s.onload = function () {
        window.Intercom("boot", window.intercomSettings);
      };
    } else {
      window.Intercom("boot", window.intercomSettings);
    }
  }

  // ── 4. USER SWITCHER UI ────────────────────────────────────────────────────
  // A small floating panel, bottom-left, for testing only.
  // Remove this block (and the CSS below) before going to production.

  function buildSwitcher() {
    var activeId = getActiveUserId();

    // Wrapper
    var panel = document.createElement("div");
    panel.id = "nk-user-switcher";
    panel.innerHTML = [
      '<div id="nk-switcher-label">🧪 Test user</div>',
      '<select id="nk-user-select">',
        Object.keys(CUSTOMERS).map(function (id) {
          var c = CUSTOMERS[id];
          var sel = id === activeId ? " selected" : "";
          return '<option value="' + id + '"' + sel + '>' + c.name + ' (' + id + ')</option>';
        }).join(""),
      '</select>',
      '<div id="nk-user-info"></div>',
    ].join("");

    document.body.appendChild(panel);

    // Inject styles
    var style = document.createElement("style");
    style.textContent = [
      "#nk-user-switcher {",
      "  position: fixed; bottom: 80px; left: 16px; z-index: 9999;",
      "  background: #1a2433; color: #e8e0d5; border-radius: 10px;",
      "  padding: 10px 14px; font-family: system-ui, sans-serif;",
      "  font-size: 12px; box-shadow: 0 4px 18px rgba(0,0,0,0.4);",
      "  min-width: 210px;",
      "}",
      "#nk-switcher-label {",
      "  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;",
      "  color: #7a9e9f; margin-bottom: 6px;",
      "}",
      "#nk-user-select {",
      "  width: 100%; background: #243040; color: #e8e0d5;",
      "  border: 1px solid #3a5060; border-radius: 6px;",
      "  padding: 5px 8px; font-size: 12px; cursor: pointer;",
      "}",
      "#nk-user-info {",
      "  margin-top: 8px; font-size: 11px; color: #9ab8b9; line-height: 1.5;",
      "}",
    ].join("\n");
    document.head.appendChild(style);

    updateInfoPanel(activeId);

    // Handle user change
    document.getElementById("nk-user-select").addEventListener("change", function (e) {
      var newId = e.target.value;
      setActiveUser(newId);
      updateInfoPanel(newId);
      bootIntercom(newId);
    });
  }

  function updateInfoPanel(userId) {
    var c = CUSTOMERS[userId];
    var el = document.getElementById("nk-user-info");
    if (el && c) {
      el.innerHTML = c.email + "<br>" + c.state;
    }
  }

  // ── 5. INIT ────────────────────────────────────────────────────────────────

  function init() {
    var activeId = getActiveUserId();
    bootIntercom(activeId);
    buildSwitcher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
