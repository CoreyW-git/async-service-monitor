const state = {
  pollingHandle: null,
  session: null,
  monitorsExpanded: false,
  clusterExpanded: false,
};

const ROLE_LEVELS = {
  read_only: 1,
  read_write: 2,
  admin: 3,
};

const EMAIL_PROVIDER_DEFAULTS = {
  m365: { host: "smtp.office365.com", port: 587, use_tls: true, use_ssl: false },
  yahoo: { host: "smtp.mail.yahoo.com", port: 587, use_tls: true, use_ssl: false },
  gmail: { host: "smtp.gmail.com", port: 587, use_tls: true, use_ssl: false },
  outlook: { host: "smtp-mail.outlook.com", port: 587, use_tls: true, use_ssl: false },
  custom: { host: "", port: 587, use_tls: true, use_ssl: false },
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${response.status}`);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtTime(epoch) {
  if (!epoch) return "Never";
  return new Date(epoch * 1000).toLocaleString();
}

function statusClass(status) {
  return status === "healthy" ? "healthy" : status === "unhealthy" ? "unhealthy" : "disabled";
}

function statusLabel(status) {
  if (status === "healthy") return "Healthy";
  if (status === "unhealthy") return "Unhealthy";
  if (status === "disabled") return "Disabled";
  return "Unknown";
}

function statusPill(status) {
  const neutral = status === "disabled" || status === "unknown";
  return `<span class="pill ${status === "unhealthy" ? "bad" : neutral ? "neutral" : ""}">${escapeHtml(statusLabel(status))}</span>`;
}

function parseCsv(input) {
  return String(input || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function csv(value) {
  return Array.isArray(value) ? value.join(",") : "";
}

function currentRoleLevel() {
  return ROLE_LEVELS[state.session?.role || "read_only"] || 1;
}

function hasRole(minimumRole) {
  return currentRoleLevel() >= (ROLE_LEVELS[minimumRole] || 99);
}

function formatDuration(milliseconds) {
  if (milliseconds == null) return "n/a";
  return `${Math.round(Number(milliseconds))} ms`;
}

function lastMetricLabel(points) {
  const latest = Array.isArray(points) && points.length ? points[points.length - 1] : null;
  if (!latest) return "No telemetry yet";
  return `Last fired ${fmtTime(latest.timestamp)}`;
}

function sparklineMarkup(points, variant = "good") {
  const values = Array.isArray(points) && points.length
    ? points.map((point) => (point.healthy ? 1 : 0))
    : [0];
  const width = 180;
  const height = 44;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const coords = values.map((value, index) => {
    const x = values.length > 1 ? index * step : width / 2;
    const y = height - value * (height - 8) - 4;
    return [x, y];
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1][0].toFixed(1)} ${height} L ${coords[0][0].toFixed(1)} ${height} Z`;
  return `
    <svg class="sparkline ${variant}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path class="area" d="${area}"></path>
      <path class="line" d="${line}"></path>
    </svg>
  `;
}

function endpointSparkline(check, checkMetrics) {
  const points = checkMetrics[check.name] || [];
  const variant = check.status === "unhealthy" ? "bad" : check.status === "disabled" ? "neutral" : "good";
  return sparklineMarkup(points, variant);
}

function nodeSparkline(nodeId, nodeMetrics) {
  const points = nodeMetrics[nodeId] || [];
  const latest = points[points.length - 1];
  const variant = latest ? (latest.healthy ? "good" : "bad") : "neutral";
  return sparklineMarkup(points, variant);
}

function checkTargetLabel(check) {
  if (check.url) {
    return `${check.url}${check.port ? `:${check.port}` : ""}`;
  }
  if (check.host) {
    return `${check.host}${check.port ? `:${check.port}` : ""}`;
  }
  return check.port ? `Port ${check.port}` : "Target not configured";
}

function checkCategoryLabel(type) {
  const labels = {
    http: "HTTP",
    dns: "DNS",
    auth: "Auth",
    generic: "Generic",
    database: "Database",
  };
  return labels[type] || String(type || "Other").toUpperCase();
}

function monitorCardMarkup(check, checkMetrics) {
  const points = checkMetrics[check.name] || [];
  return `
    <a class="status-row" href="/monitors/${encodeURIComponent(check.name)}" data-link>
      <span class="dot ${statusClass(check.status)}"></span>
      <div>
        <strong>${escapeHtml(check.name)}</strong>
        <div class="status-meta">
          <span>${escapeHtml(checkCategoryLabel(check.type))}</span>
          <span>${escapeHtml(checkTargetLabel(check))}</span>
        </div>
      </div>
      <div>
        ${endpointSparkline(check, checkMetrics)}
        <div class="status-meta">
          <span>Last run ${formatDuration(check.latest_result?.duration_ms)}</span>
          <span>${escapeHtml(lastMetricLabel(points))}</span>
        </div>
      </div>
      ${statusPill(check.status)}
      <span class="subtle">${escapeHtml(check.latest_result?.message || "Waiting for result")}</span>
    </a>
  `;
}

function renderOverview(overview, checks) {
  const healthy = checks.filter((check) => check.status === "healthy").length;
  const unhealthy = checks.filter((check) => check.status === "unhealthy").length;
  const disabled = checks.filter((check) => check.status === "disabled").length;
  document.getElementById("overview-cards").innerHTML = "";

  return { healthy, unhealthy, disabled };
}

function renderSessionChip() {
  const chip = document.getElementById("session-chip");
  if (!state.session?.authenticated) {
    chip.classList.add("hidden");
    chip.textContent = "";
    return;
  }
  chip.classList.remove("hidden");
  chip.innerHTML = `
    <a href="/profile" data-link class="profile-link-card">
      <span class="profile-link-label">Personal Settings</span>
      <strong>${escapeHtml([state.session.first_name, state.session.last_name].filter(Boolean).join(" ") || state.session.username)}</strong><br />
      <span>${escapeHtml(state.session.username)} · ${escapeHtml(state.session.role.replaceAll("_", " "))}</span>
      <span class="profile-link-hint">Open profile, password, and theme preferences</span>
    </a>
    <div class="button-row" style="margin-top: 10px;">
      <button type="button" class="secondary" id="logout-btn">Log Out</button>
    </div>
  `;
}

function applyTheme(session = state.session) {
  const theme = session?.authenticated && session?.dark_mode ? "dark" : "light";
  document.body.dataset.theme = theme;
}

function renderSidebar(checks, containersData) {
  const currentPath = window.location.pathname;
  const authenticated = Boolean(state.session?.authenticated);
  document.querySelectorAll(".sidebar-nav a, .sidebar-nav button[data-role-min]").forEach((link) => {
    const minRole = link.dataset.roleMin;
    const visible = authenticated && (!minRole || hasRole(minRole));
    link.classList.toggle("hidden", !visible);
    if (link.tagName === "A") {
      link.classList.toggle("active", visible && link.getAttribute("href") === currentPath);
    }
  });

  const monitorList = document.getElementById("sidebar-monitors");
  const sidebarSection = document.getElementById("configured-monitors-section");
  const toggle = document.getElementById("configured-monitors-toggle");
  const chevron = document.getElementById("configured-monitors-chevron");
  const clusterList = document.getElementById("sidebar-cluster-containers");
  const clusterSection = document.getElementById("cluster-section");
  const clusterToggle = document.getElementById("cluster-toggle");
  const clusterChevron = document.getElementById("cluster-chevron");
  const configureLink = document.getElementById("configure-containers-link");
  sidebarSection.classList.toggle("hidden", !authenticated || !state.monitorsExpanded);
  toggle.classList.toggle("hidden", !authenticated);
  toggle.classList.toggle("active", state.monitorsExpanded);
  chevron.textContent = state.monitorsExpanded ? "-" : "+";
  const clusterVisible = authenticated && hasRole("admin");
  clusterSection.classList.toggle("hidden", !clusterVisible || !state.clusterExpanded);
  clusterToggle.classList.toggle("hidden", !clusterVisible);
  clusterToggle.classList.toggle("active", state.clusterExpanded || currentPath.startsWith("/cluster"));
  clusterChevron.textContent = state.clusterExpanded ? "-" : "+";
  configureLink.classList.toggle("active", currentPath === "/cluster/configure" || currentPath === "/containers");
  if (!authenticated) {
    monitorList.innerHTML = "";
    clusterList.innerHTML = "";
    return;
  }

  const groups = checks.reduce((acc, check) => {
    const key = check.type || "other";
    acc[key] = acc[key] || [];
    acc[key].push(check);
    return acc;
  }, {});

  const typeOrder = ["http", "dns", "auth", "database", "generic"];
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const aIndex = typeOrder.indexOf(a);
    const bIndex = typeOrder.indexOf(b);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex) || a.localeCompare(b);
  });

  monitorList.innerHTML = sortedKeys
    .map((type) => `
      <div class="monitor-group">
        <div class="monitor-group-title">
          <strong>${escapeHtml(type)}</strong>
          <span>${groups[type].length}</span>
        </div>
        <div class="monitor-group-list">
          ${groups[type]
            .map(
              (check) => `
                <a class="sidebar-link ${currentPath === `/monitors/${encodeURIComponent(check.name)}` ? "active" : ""}" href="/monitors/${encodeURIComponent(check.name)}" data-link>
                  <span>${escapeHtml(check.name)}</span>
                  <span class="dot ${statusClass(check.status)}"></span>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
    `)
    .join("");

  const containers = containersData?.available ? containersData.containers || [] : [];
  clusterList.innerHTML = containers.length
    ? containers
        .map(
          (container) => `
            <a class="sidebar-link ${currentPath === `/cluster/${encodeURIComponent(container.name)}` ? "active" : ""}" href="/cluster/${encodeURIComponent(container.name)}" data-link>
              <span>${escapeHtml(container.name)}</span>
              <span class="dot ${container.status === "running" ? "healthy" : "disabled"}"></span>
            </a>
          `
        )
        .join("")
    : `<div class="monitor-group"><div class="monitor-group-title"><strong>containers</strong><span>0</span></div><div class="subtle">No live cluster containers found.</div></div>`;
}

function setWorkspaceHeader(title, subtitle) {
  document.getElementById("workspace-title").textContent = title;
  document.getElementById("workspace-subtitle").textContent = subtitle;
}

function renderLoginPage() {
  setWorkspaceHeader("Sign In", "Sign in to the portal, create a new account, or reset your password.");
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="split-panels">
      <section class="panel">
        <div class="panel-head">
          <h3>Login</h3>
          <p>Use your portal credentials to access the monitoring dashboard.</p>
        </div>
        <form id="login-form" class="check-form">
          <label><span>Username</span><input name="username" required /></label>
          <label><span>Password</span><input name="password" type="password" required /></label>
          <button type="submit">Sign In</button>
          <p class="form-status" id="login-status"></p>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Create Account</h3>
          <p>New self-service accounts start as read-only until an administrator grants more access.</p>
        </div>
        <form id="register-form" class="check-form">
          <label><span>First Name</span><input name="first_name" /></label>
          <label><span>Last Name</span><input name="last_name" /></label>
          <label><span>Username</span><input name="username" required /></label>
          <label><span>Password</span><input name="password" type="password" required /></label>
          <button type="submit">Create Account</button>
          <p class="form-status" id="register-status"></p>
        </form>

        <div class="panel-head" style="margin-top: 24px;">
          <h3>Reset Password</h3>
          <p>Reset your password by username. Administrators can further tighten this flow later.</p>
        </div>
        <form id="reset-password-form" class="check-form">
          <label><span>Username</span><input name="username" required /></label>
          <label><span>New Password</span><input name="password" type="password" required /></label>
          <button type="submit">Reset Password</button>
          <p class="form-status" id="reset-password-status"></p>
        </form>
      </section>
    </div>
  `;
}

function renderProfilePage(profile) {
  setWorkspaceHeader("Profile", "Review and update your personal account details.");
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="detail-grid">
      <section class="panel">
        <div class="panel-head">
          <h3>Edit Profile</h3>
          <p>You can update your name and password here. Your username stays fixed once created.</p>
        </div>
        <form id="profile-form" class="check-form">
          <label><span>First Name</span><input name="first_name" value="${escapeHtml(profile.first_name || "")}" /></label>
          <label><span>Last Name</span><input name="last_name" value="${escapeHtml(profile.last_name || "")}" /></label>
          <label><span>Username</span><input name="username" value="${escapeHtml(profile.username)}" disabled /></label>
          <label>
            <span>Theme</span>
            <select name="dark_mode">
              <option value="false" ${!profile.dark_mode ? "selected" : ""}>Light Mode</option>
              <option value="true" ${profile.dark_mode ? "selected" : ""}>Dark Mode</option>
            </select>
          </label>
          <label><span>New Password</span><input name="password" type="password" placeholder="Leave blank to keep your current password" /></label>
          <button type="submit">Save Profile</button>
          <p class="form-status" id="profile-status"></p>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Account Details</h3>
          <p>Your access level and most recent successful sign-in are shown here.</p>
        </div>
        <div class="stack">
          <article class="guide-card">
            <h4>Access Level</h4>
            <p>${escapeHtml(profile.role.replaceAll("_", " "))}</p>
          </article>
          <article class="guide-card">
            <h4>Last Login</h4>
            <p>${fmtTime(profile.last_login_at)}</p>
          </article>
          <article class="guide-card">
            <h4>Auth Provider</h4>
            <p>${escapeHtml(profile.provider || "basic")}</p>
          </article>
          <article class="guide-card">
            <h4>Theme Preference</h4>
            <p>${profile.dark_mode ? "Dark mode" : "Light mode"}</p>
          </article>
        </div>
      </section>
    </div>
  `;
}

function renderDashboard(overview, checks, summaryCounts, checkMetrics, nodeMetrics, cluster) {
  setWorkspaceHeader("Dashboard", "Live endpoint availability and monitoring node health at a glance.");
  const root = document.getElementById("app-root");
  const endpointChecks = checks.filter((check) => check.type !== "database");
  const databaseChecks = checks.filter((check) => check.type === "database");
  const enabledEndpointChecks = endpointChecks.filter((check) => check.status !== "disabled");
  const healthyEnabledEndpointChecks = enabledEndpointChecks.filter((check) => check.status === "healthy");
  const unhealthyEnabledEndpointChecks = enabledEndpointChecks.filter((check) => check.status === "unhealthy");
  const disabledChecks = checks.filter((check) => check.status === "disabled");
  const activeChecks = checks.filter((check) => check.status !== "disabled");
  const endpointCards = enabledEndpointChecks.map((check) => monitorCardMarkup(check, checkMetrics)).join("");
  const disabledCards = disabledChecks.map((check) => monitorCardMarkup(check, checkMetrics)).join("");
  const databaseCards = databaseChecks.map((check) => monitorCardMarkup(check, checkMetrics)).join("");

  const nodeIds = Array.from(
    new Set([
      overview.node_id,
      ...(cluster?.peers || []).map((peer) => peer.node_id),
      ...Object.keys(nodeMetrics || {}),
    ])
  );
  const totalNodes = nodeIds.length;
  const healthyNodeCount = Array.from(
    new Set([overview.node_id, ...((cluster?.healthy_nodes || []).filter(Boolean))])
  ).length;
  const unhealthyNodeCount = Math.max(totalNodes - healthyNodeCount, 0);
  const healthPercent = activeChecks.length
    ? Math.round((summaryCounts.healthy / activeChecks.length) * 100)
    : 0;
  const recentFailures = checks.filter((check) => check.status === "unhealthy").slice(0, 3);
  const availabilityState =
    activeChecks.length === 0
      ? "neutral"
      : summaryCounts.unhealthy === 0
        ? "good"
        : summaryCounts.healthy === 0
          ? "bad"
          : "warn";
  const enabledMonitorState =
    enabledEndpointChecks.length === 0
      ? "neutral"
      : unhealthyEnabledEndpointChecks.length === 0
        ? "good"
        : healthyEnabledEndpointChecks.length === 0
          ? "bad"
          : "warn";
  const nodeState =
    totalNodes === 0
      ? "neutral"
      : unhealthyNodeCount === 0
        ? "good"
        : healthyNodeCount === 0
          ? "bad"
          : "warn";

  const nodeCards = nodeIds
    .map((nodeId) => {
      const points = nodeMetrics[nodeId] || [];
      const latest = points[points.length - 1];
      const status = latest ? (latest.healthy ? "healthy" : "unhealthy") : "unknown";
      const peer = cluster?.peers?.find((item) => item.node_id === nodeId);
      const subtitle = nodeId === overview.node_id ? "Local node" : peer?.base_url || "Peer monitor";
      return `
        <article class="guide-card">
          <div class="status-row">
            <span class="dot ${statusClass(status)}"></span>
            <div>
              <strong>${escapeHtml(nodeId)}</strong>
              <div class="status-meta">
                <span>${escapeHtml(subtitle)}</span>
              </div>
            </div>
            <div>${nodeSparkline(nodeId, nodeMetrics)}</div>
            ${statusPill(status)}
            <span class="subtle">${latest ? `Last heartbeat ${fmtTime(latest.timestamp)}` : "No heartbeat data yet"}</span>
          </div>
        </article>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="grafana-dashboard">
      <section class="grafana-hero">
        <article class="panel grafana-panel grafana-panel-primary">
          <div class="panel-head">
            <h3>Service Health</h3>
            <p>Overall monitor health across the active service estate.</p>
          </div>
          <div class="grafana-health-grid">
            <div class="grafana-health-score aggregate-${availabilityState}">
              <span class="grafana-label">Availability</span>
              <strong>${healthPercent}%</strong>
              <span class="subtle">${summaryCounts.healthy} of ${activeChecks.length} enabled monitors healthy</span>
            </div>
            <div class="dashboard-kpis">
              <article class="chart-card grafana-stat-card">
                <p class="subtle">Healthy</p>
                <div class="chart-value">${summaryCounts.healthy}</div>
              </article>
              <article class="chart-card grafana-stat-card danger">
                <p class="subtle">Unhealthy</p>
                <div class="chart-value">${summaryCounts.unhealthy}</div>
              </article>
              <article class="chart-card grafana-stat-card neutral">
                <p class="subtle">Disabled</p>
                <div class="chart-value">${summaryCounts.disabled}</div>
              </article>
              <article class="chart-card grafana-stat-card">
                <p class="subtle">Total</p>
                <div class="chart-value">${checks.length}</div>
              </article>
            </div>
          </div>
        </article>

        <article class="panel grafana-panel grafana-panel-secondary">
          <div class="panel-head">
            <h3>Operations Snapshot</h3>
            <p>Node coverage, cluster state, and the most recent problem checks.</p>
          </div>
          <div class="dashboard-summary-list">
            <div class="dashboard-summary-row">
              <span>Healthy Nodes</span>
              <strong>${healthyNodeCount} / ${totalNodes}</strong>
            </div>
            <div class="dashboard-summary-row">
              <span>Cluster Mode</span>
              <strong>${cluster?.enabled ? "Enabled" : "Standalone"}</strong>
            </div>
            <div class="dashboard-summary-row">
              <span>Database Monitors</span>
              <strong>${databaseChecks.length}</strong>
            </div>
          </div>
          <div class="grafana-incident-list">
            <span class="grafana-label">Recent Issues</span>
            ${
              recentFailures.length
                ? recentFailures
                    .map(
                      (check) => `
                        <a class="grafana-incident" href="/monitors/${encodeURIComponent(check.name)}" data-link>
                          <span class="dot unhealthy"></span>
                          <span>${escapeHtml(check.name)}</span>
                          <span class="subtle">${escapeHtml(check.latest_result?.message || "Unhealthy")}</span>
                        </a>
                      `
                    )
                    .join("")
                : `<div class="grafana-incident ok"><span class="dot healthy"></span><span>No active incidents</span><span class="subtle">Everything currently looks stable</span></div>`
            }
          </div>
        </article>
      </section>

      <section class="grafana-main-grid">
        <details class="accordion-item aggregate-${enabledMonitorState}">
          <summary class="accordion-summary">
            <div>
              <strong>Enabled Monitors</strong>
              <div class="status-meta">
                <span>${healthyEnabledEndpointChecks.length} healthy</span>
                <span>${unhealthyEnabledEndpointChecks.length} unhealthy</span>
              </div>
            </div>
          </summary>
          <div class="accordion-body">
            <div class="status-list">
              ${endpointCards || `<article class="guide-card"><p>No endpoint monitors are configured yet.</p></article>`}
            </div>
          </div>
        </details>

        <details class="accordion-item aggregate-${nodeState}">
          <summary class="accordion-summary">
            <div>
              <strong>Monitoring Nodes</strong>
              <div class="status-meta">
                <span>${healthyNodeCount} healthy</span>
                <span>${unhealthyNodeCount} unhealthy</span>
              </div>
            </div>
          </summary>
          <div class="accordion-body">
            <div class="stack">
              ${nodeCards || `<article class="guide-card"><p>No node history is available yet.</p></article>`}
            </div>
          </div>
        </details>
      </section>

      <details class="accordion-item">
        <summary class="accordion-summary">
          <div>
            <strong>Disabled Monitors</strong>
            <div class="status-meta">
              <span>Checks currently excluded from active availability calculations</span>
            </div>
          </div>
          ${statusPill(disabledChecks.length ? "disabled" : "unknown")}
        </summary>
        <div class="accordion-body">
          <div class="status-list">
            ${disabledCards || `<article class="guide-card"><p>No disabled monitors right now.</p></article>`}
          </div>
        </div>
      </details>

      <section class="panel grafana-panel">
        <div class="panel-head">
          <h3>Database</h3>
          <p>Database availability graphs for configured databases and telemetry storage targets.</p>
        </div>
        <div class="status-list">
          ${databaseCards || `<article class="guide-card"><p>No database monitors are configured yet.</p></article>`}
        </div>
      </section>
    </div>
  `;
}

function authSummary(check) {
  if (!check.auth) return "No auth configured";
  if (check.auth.type === "bearer") return "Bearer token";
  if (check.auth.type === "basic") return `Basic auth${check.auth.username ? ` as ${check.auth.username}` : ""}`;
  return `Header auth${check.auth.header_name ? ` via ${check.auth.header_name}` : ""}`;
}

function disableForm(form, disabled) {
  form.querySelectorAll("input, select, button").forEach((element) => {
    if (element.dataset.alwaysEnabled === "true") {
      return;
    }
    element.disabled = disabled;
  });
}

function monitorFormMarkup(check, mode) {
  const auth = check.auth || {};
  const isNew = mode === "create";
  const canWrite = hasRole("read_write");
  const managed = Boolean(check.generated);
  const editable = canWrite && !managed;
  const readonlyAttr = editable ? "" : "disabled";
  return `
    <div class="detail-grid">
      <section class="panel">
        <div class="panel-head">
          <h3>${isNew ? "Add Monitor" : `Edit ${escapeHtml(check.name)}`}</h3>
          <p>${isNew ? "Create a new endpoint monitor." : managed ? "This monitor is generated from service configuration and is read-only here." : "Save changes and the monitor will re-run immediately."}</p>
        </div>
        <form class="check-form" id="monitor-form" data-original-name="${escapeHtml(check.name || "")}">
          <div class="accordion">
            <details class="accordion-item" open>
              <summary class="accordion-summary">
                <div>
                  <strong>Basics</strong>
                  <div class="status-meta">
                    <span>Name, type, and enabled state</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body">
                <label><span>Name</span><input name="name" value="${escapeHtml(check.name || "")}" required ${readonlyAttr} /></label>
                <label>
                  <span>Type</span>
                  <select name="type" ${readonlyAttr}>
                    <option value="http" ${check.type === "http" ? "selected" : ""}>HTTP</option>
                    <option value="dns" ${check.type === "dns" ? "selected" : ""}>DNS</option>
                    <option value="auth" ${check.type === "auth" ? "selected" : ""}>Auth</option>
                    <option value="database" ${check.type === "database" ? "selected" : ""}>Database</option>
                    <option value="generic" ${check.type === "generic" ? "selected" : ""}>Generic</option>
                  </select>
                </label>
                <label>
                  <span>Enabled</span>
                  <select name="enabled" ${readonlyAttr}>
                    <option value="true" ${check.enabled !== false ? "selected" : ""}>Enabled</option>
                    <option value="false" ${check.enabled === false ? "selected" : ""}>Disabled</option>
                  </select>
                </label>
              </div>
            </details>

            <details class="accordion-item" open>
              <summary class="accordion-summary">
                <div>
                  <strong>Target And Schedule</strong>
                  <div class="status-meta">
                    <span>What to monitor and how often to run it</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body">
                <label><span>Interval Seconds</span><input name="interval_seconds" type="number" min="1" value="${escapeHtml(check.interval_seconds || 300)}" required ${readonlyAttr} /></label>
                <label><span>Timeout Seconds</span><input name="timeout_seconds" type="number" min="1" value="${escapeHtml(check.timeout_seconds || 10)}" ${readonlyAttr} /></label>
                <label class="field-url ${["http", "auth"].includes(check.type) ? "" : "hidden"}"><span>URL</span><input name="url" value="${escapeHtml(check.url || "")}" ${readonlyAttr} /></label>
                <label class="field-host ${["dns", "database", "generic"].includes(check.type) ? "" : "hidden"}"><span>Host</span><input name="host" value="${escapeHtml(check.host || "")}" ${readonlyAttr} /></label>
                <label class="field-port ${["http", "auth", "database", "generic"].includes(check.type) ? "" : "hidden"}"><span>Port</span><input name="port" type="number" min="1" max="65535" value="${escapeHtml(check.port || "")}" ${readonlyAttr} /></label>
              </div>
            </details>

            <details class="accordion-item ${["http", "auth"].includes(check.type) ? "validation-open" : ""}" ${["http", "auth"].includes(check.type) ? "open" : ""}>
              <summary class="accordion-summary field-statuses ${["http", "auth"].includes(check.type) ? "" : "hidden"}">
                <div>
                  <strong>Validation Rules</strong>
                  <div class="status-meta">
                    <span>Status codes and content assertions</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body field-statuses ${["http", "auth"].includes(check.type) ? "" : "hidden"}">
                <label class="field-statuses ${["http", "auth"].includes(check.type) ? "" : "hidden"}"><span>Expected Statuses</span><input name="expected_statuses" value="${escapeHtml(csv(check.expected_statuses || [200]))}" ${readonlyAttr} /></label>
                <label class="field-content ${["http", "auth"].includes(check.type) ? "" : "hidden"}"><span>Contains Text</span><input name="contains" value="${escapeHtml(csv(check.content_rules?.contains || []))}" ${readonlyAttr} /></label>
                <label class="field-content ${["http", "auth"].includes(check.type) ? "" : "hidden"}"><span>Exclude Text</span><input name="not_contains" value="${escapeHtml(csv(check.content_rules?.not_contains || []))}" ${readonlyAttr} /></label>
                <label class="field-content ${["http", "auth"].includes(check.type) ? "" : "hidden"}"><span>Regex</span><input name="regex" value="${escapeHtml(check.content_rules?.regex || "")}" ${readonlyAttr} /></label>
              </div>
            </details>

            <details class="accordion-item auth-only ${check.type !== "auth" ? "hidden" : ""}" ${check.type === "auth" ? "open" : ""}>
              <summary class="accordion-summary auth-only ${check.type !== "auth" ? "hidden" : ""}">
                <div>
                  <strong>Authentication</strong>
                  <div class="status-meta">
                    <span>Credentials and auth headers for protected endpoints</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body auth-only ${check.type !== "auth" ? "hidden" : ""}">
                <label class="auth-only ${check.type !== "auth" ? "hidden" : ""}" data-auth-field="type">
                  <span>Auth Type</span>
                  <select name="auth_type" ${readonlyAttr}>
                    <option value="bearer" ${auth.type === "bearer" ? "selected" : ""}>Bearer</option>
                    <option value="basic" ${auth.type === "basic" ? "selected" : ""}>Basic</option>
                    <option value="header" ${auth.type === "header" ? "selected" : ""}>Header</option>
                  </select>
                </label>
                <label class="auth-only ${check.type !== "auth" || auth.type !== "bearer" ? "hidden" : ""}" data-auth-field="token"><span>Bearer Token</span><input name="token" value="${escapeHtml(auth.token || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${check.type !== "auth" || auth.type !== "basic" ? "hidden" : ""}" data-auth-field="username"><span>Username</span><input name="username" value="${escapeHtml(auth.username || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${check.type !== "auth" || auth.type !== "basic" ? "hidden" : ""}" data-auth-field="password"><span>Password</span><input name="password" type="password" value="${escapeHtml(auth.password || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${check.type !== "auth" || auth.type !== "header" ? "hidden" : ""}" data-auth-field="header_name"><span>Header Name</span><input name="header_name" value="${escapeHtml(auth.header_name || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${check.type !== "auth" || auth.type !== "header" ? "hidden" : ""}" data-auth-field="header_value"><span>Header Value</span><input name="header_value" value="${escapeHtml(auth.header_value || "")}" ${readonlyAttr} /></label>
              </div>
            </details>

            <details class="accordion-item database-only ${check.type !== "database" ? "hidden" : ""}" ${check.type === "database" ? "open" : ""}>
              <summary class="accordion-summary database-only ${check.type !== "database" ? "hidden" : ""}">
                <div>
                  <strong>Database Settings</strong>
                  <div class="status-meta">
                    <span>Connection details for database monitoring</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body database-only ${check.type !== "database" ? "hidden" : ""}">
                <label class="database-only ${check.type !== "database" ? "hidden" : ""}"><span>Database Name</span><input name="database_name" value="${escapeHtml(check.database_name || "")}" ${readonlyAttr} /></label>
                <label class="database-only ${check.type !== "database" ? "hidden" : ""}">
                  <span>Database Engine</span>
                  <select name="database_engine" ${readonlyAttr}>
                    <option value="mysql" ${(check.database_engine || "mysql") === "mysql" ? "selected" : ""}>MySQL</option>
                  </select>
                </label>
                <label class="database-only ${check.type !== "database" ? "hidden" : ""}"><span>Database Username</span><input name="database_username" value="${escapeHtml(auth.username || "")}" ${readonlyAttr} /></label>
                <label class="database-only ${check.type !== "database" ? "hidden" : ""}"><span>Database Password</span><input name="database_password" type="password" value="${escapeHtml(auth.password || "")}" ${readonlyAttr} /></label>
              </div>
            </details>
          </div>
          <div class="button-row ${editable ? "" : "hidden"}">
            <button type="submit">${isNew ? "Create Monitor" : "Save Changes"}</button>
            ${
              isNew
                ? ""
                : `<button type="button" class="secondary" id="toggle-monitor-btn">${check.enabled ? "Disable" : "Enable"}</button>
                   <button type="button" class="danger" id="delete-monitor-btn">Delete</button>`
            }
          </div>
          <p class="form-status" id="monitor-form-status">${managed ? "This monitor is managed by service configuration." : canWrite ? "" : "Read-only access: editing is disabled for this account."}</p>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Monitor Status</h3>
          <p>Latest outcome, ownership, and authentication context.</p>
        </div>
        <div class="stack">
          <div class="status-row">
            <span class="dot ${statusClass(check.status)}"></span>
            <div>
              <strong>${escapeHtml(check.name || "New monitor")}</strong>
              <div class="status-meta">
                <span>${escapeHtml(checkCategoryLabel(check.type || "http"))}</span>
                <span>${escapeHtml(authSummary(check))}</span>
              </div>
            </div>
            <div>${sparklineMarkup(check.metric_points || [], check.status === "unhealthy" ? "bad" : check.status === "disabled" ? "neutral" : "good")}</div>
            ${statusPill(check.status || "unknown")}
            <span class="subtle">${escapeHtml(check.latest_result?.message || "No result yet")}</span>
          </div>
          <div class="guide-card">
            <h4>Last Checked</h4>
            <p>${fmtTime(check.latest_result?.timestamp)}</p>
          </div>
          <div class="guide-card">
            <h4>Owner</h4>
            <p>${escapeHtml(check.owner || "monitor-1")}</p>
          </div>
          <div class="guide-card">
            <h4>Target</h4>
            <p>${escapeHtml(checkTargetLabel(check))}</p>
          </div>
          <div class="guide-card">
            <h4>Last Duration</h4>
            <p>${formatDuration(check.latest_result?.duration_ms)}</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderContainersPage(peers, containers, nodeMetrics) {
  setWorkspaceHeader("Configure Containers", "Configure peer monitors, add new nodes, and define how the cluster is managed.");
  const root = document.getElementById("app-root");
  const canAdmin = hasRole("admin");
  root.innerHTML = `
    <div class="split-panels">
      <section class="panel">
        <div class="panel-head">
          <h3>Peer Monitors</h3>
          <p>Container-to-container monitor health and recovery settings.</p>
        </div>
        <form id="create-peer-form" class="check-form ${canAdmin ? "" : "hidden"}">
          <label><span>Node ID</span><input name="node_id" placeholder="monitor-4" required /></label>
          <label><span>Base URL</span><input name="base_url" placeholder="http://monitor-4:8080" required /></label>
          <label><span>Container Name</span><input name="container_name" placeholder="monitor-4" /></label>
          <label><span>Peer Monitor</span><select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <label><span>Recovery</span><select name="recovery_enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <button type="submit">Add Peer Monitor</button>
          <p class="form-status" id="peer-create-status"></p>
        </form>
        ${canAdmin ? "" : `<p class="subtle">Container and peer management is restricted to administrators.</p>`}
        <div class="stack">
          ${peers
            .map(
              (peer) => `
                <article class="guide-card">
                  <form class="check-form peer-form" data-peer-id="${escapeHtml(peer.node_id)}">
                    <div class="status-row">
                      <span class="dot ${peer.healthy ? "healthy" : peer.enabled ? "unhealthy" : "disabled"}"></span>
                      <div>
                        <strong>${escapeHtml(peer.node_id)}</strong>
                        <div class="status-meta"><span>${escapeHtml(peer.base_url)}</span></div>
                      </div>
                      <div>${nodeSparkline(peer.node_id, nodeMetrics)}</div>
                      ${statusPill(peer.healthy ? "healthy" : peer.enabled ? "unhealthy" : "disabled")}
                      <span class="subtle">${escapeHtml(peer.last_error || "Peer reachable")}</span>
                    </div>
                    <label><span>Node ID</span><input name="node_id" value="${escapeHtml(peer.node_id)}" required ${canAdmin ? "" : "disabled"} /></label>
                    <label><span>Base URL</span><input name="base_url" value="${escapeHtml(peer.base_url)}" required ${canAdmin ? "" : "disabled"} /></label>
                    <label><span>Container Name</span><input name="container_name" value="${escapeHtml(peer.container_name || "")}" ${canAdmin ? "" : "disabled"} /></label>
                    <label><span>Peer Monitor</span><select name="enabled" ${canAdmin ? "" : "disabled"}><option value="true" ${peer.enabled ? "selected" : ""}>Enabled</option><option value="false" ${!peer.enabled ? "selected" : ""}>Disabled</option></select></label>
                    <label><span>Recovery</span><select name="recovery_enabled" ${canAdmin ? "" : "disabled"}><option value="true" ${peer.recovery?.enabled ? "selected" : ""}>Enabled</option><option value="false" ${!peer.recovery?.enabled ? "selected" : ""}>Disabled</option></select></label>
                    <div class="button-row ${canAdmin ? "" : "hidden"}">
                      <button type="submit">Save Peer</button>
                      <button type="button" class="secondary" data-toggle-peer="${escapeHtml(peer.node_id)}" data-enabled="${peer.enabled ? "true" : "false"}">${peer.enabled ? "Disable" : "Enable"}</button>
                      <button type="button" class="danger" data-delete-peer="${escapeHtml(peer.node_id)}">Delete</button>
                    </div>
                    <p class="form-status"></p>
                  </form>
                </article>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Add Monitor Container</h3>
          <p>Create a new monitor container and register it with peer monitoring.</p>
        </div>
        <form id="create-container-form" class="check-form ${canAdmin ? "" : "hidden"}">
          <label><span>Node ID</span><input name="node_id" placeholder="monitor-4" required /></label>
          <label><span>Container Name</span><input name="container_name" placeholder="monitor-4" required /></label>
          <label><span>Image</span><input name="image" placeholder="async-service-monitor:latest" required /></label>
          <label><span>Base URL</span><input name="base_url" placeholder="http://monitor-4:8080" required /></label>
          <label><span>Docker Network</span><input name="network" placeholder="playground_default" /></label>
          <label><span>Host Port</span><input name="host_port" type="number" min="1" placeholder="8004" /></label>
          <button type="submit">Create Container</button>
          <p class="form-status" id="container-create-status"></p>
        </form>
        <div class="stack">
          ${(containers.available ? containers.containers : []).map((container) => `
            <article class="guide-card">
              <div class="status-row">
                <span class="dot ${container.status === "running" ? "healthy" : "disabled"}"></span>
                <div>
                  <strong>${escapeHtml(container.name)}</strong>
                  <div class="status-meta"><span>${escapeHtml(container.image)}</span></div>
                </div>
                <div>${nodeSparkline(container.name, nodeMetrics)}</div>
                ${statusPill(container.status === "running" ? "healthy" : "disabled")}
                <span class="subtle">${escapeHtml(container.status)}</span>
              </div>
              <div class="button-row ${canAdmin ? "" : "hidden"}">
                <button class="secondary" data-action="start" data-container="${escapeHtml(container.name)}">Start</button>
                <button class="danger" data-action="stop" data-container="${escapeHtml(container.name)}">Stop</button>
                <button data-action="restart" data-container="${escapeHtml(container.name)}">Restart</button>
              </div>
            </article>
          `).join("") || `<article class="guide-card"><p>No monitor containers available.</p></article>`}
        </div>
      </section>
    </div>
  `;
}

function renderContainerDetailPage(container, peer, nodeMetrics) {
  setWorkspaceHeader(container.name, "Manage the current live container and review its cluster health.");
  const root = document.getElementById("app-root");
  const canAdmin = hasRole("admin");
  const status = container.status === "running" ? "healthy" : "disabled";
  root.innerHTML = `
    <div class="detail-grid">
      <section class="panel">
        <div class="panel-head">
          <h3>Live Container</h3>
          <p>This page is for day-to-day control of the currently registered cluster container.</p>
        </div>
        <article class="guide-card">
          <div class="status-row">
            <span class="dot ${statusClass(status)}"></span>
            <div>
              <strong>${escapeHtml(container.name)}</strong>
              <div class="status-meta">
                <span>${escapeHtml(container.image || "unknown image")}</span>
                <span>${escapeHtml(peer?.base_url || "No peer URL configured")}</span>
              </div>
            </div>
            <div>${nodeSparkline(container.name, nodeMetrics)}</div>
            ${statusPill(status)}
            <span class="subtle">${escapeHtml(container.status)}</span>
          </div>
        </article>
        <div class="button-row ${canAdmin ? "" : "hidden"}" style="margin-top: 16px;">
          <button class="secondary" data-action="start" data-container="${escapeHtml(container.name)}">Start</button>
          <button class="danger" data-action="stop" data-container="${escapeHtml(container.name)}">Stop</button>
          <button data-action="restart" data-container="${escapeHtml(container.name)}">Restart</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Cluster Details</h3>
          <p>Peer registration and recovery information for this container.</p>
        </div>
        <div class="stack">
          <article class="guide-card">
            <h4>Peer Node</h4>
            <p>${escapeHtml(peer?.node_id || "Not mapped to a peer yet")}</p>
          </article>
          <article class="guide-card">
            <h4>Base URL</h4>
            <p>${escapeHtml(peer?.base_url || "n/a")}</p>
          </article>
          <article class="guide-card">
            <h4>Recovery</h4>
            <p>${peer?.recovery?.enabled ? "Enabled" : "Disabled"}</p>
          </article>
          <article class="guide-card">
            <h4>Heartbeat</h4>
            <p>${peer?.last_ok_at ? fmtTime(peer.last_ok_at) : "No heartbeat recorded yet"}</p>
          </article>
        </div>
      </section>
    </div>
  `;
}

function renderGuidePage() {
  setWorkspaceHeader("FAQ", "Answers to common setup, operations, scaling, and access questions.");
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>Frequently Asked Questions</h3>
          <p>Use this page for the most common operator questions about monitoring, editing, scaling, storage, and access control.</p>
        </div>
        <div class="guide-grid">
          <article class="guide-card">
            <h4>How do I watch endpoint health?</h4>
            <p>The dashboard shows every endpoint monitor with a health dot and a live availability trend graph.</p>
          </article>
          <article class="guide-card">
            <h4>How do I edit a monitor?</h4>
            <p>Select any monitor from the left sidebar to open a dedicated edit page for intervals, URLs, validation rules, and auth settings.</p>
          </article>
          <article class="guide-card">
            <h4>How do I scale the monitoring fleet?</h4>
            <p>The containers page lets admins manage peer monitors, control monitor containers, and add new nodes while the service is running.</p>
          </article>
          <article class="guide-card">
            <h4>How do I manage portal access?</h4>
            <p>The Administration page lets admins create read-only, read-write, and full admin accounts today, with OCI auth scaffolding ready for future integration.</p>
          </article>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Service Flow Diagram</h3>
          <p>This is the end-to-end flow from portal changes to monitor execution and telemetry storage.</p>
        </div>
        <div class="diagram-row">
          <div class="diagram-node">Portal UI</div>
          <div class="diagram-arrow">→</div>
          <div class="diagram-node">Config Store</div>
          <div class="diagram-arrow">→</div>
          <div class="diagram-node">Monitor Runner</div>
          <div class="diagram-arrow">→</div>
          <div class="diagram-node">Checks + Peer Pollers</div>
          <div class="diagram-arrow">→</div>
          <div class="diagram-node">Dashboard + Telemetry</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Cluster Coordination Diagram</h3>
          <p>Monitoring nodes can watch the same targets, watch one another, and recover failed peers.</p>
        </div>
        <div class="diagram-grid">
          <div class="diagram-node">Monitor Node A</div>
          <div class="diagram-node">Monitor Node B</div>
          <div class="diagram-node">Monitor Node C</div>
          <div class="diagram-node wide">Shared Endpoints, Peer Health, Recovery Decisions, Email Alerts</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Telemetry Storage Diagram</h3>
          <p>Telemetry can stay local in memory or be retained in MySQL for two hours, locally or in OCI.</p>
        </div>
        <div class="diagram-row">
          <div class="diagram-node">Check Result</div>
          <div class="diagram-arrow">→</div>
          <div class="diagram-node">Monitor State</div>
          <div class="diagram-arrow">→</div>
          <div class="diagram-node">Live Graphs</div>
          <div class="diagram-arrow">+</div>
          <div class="diagram-node">MySQL Retention</div>
        </div>
      </section>
    </div>
  `;
}

function renderAdminPage(users, telemetry, portalSettings, emailSettings) {
  setWorkspaceHeader("Administration", "Create accounts and control who can view, edit, or fully administer the platform.");
  const root = document.getElementById("app-root");
  const enabledUsers = users.filter((user) => user.enabled).length;
  root.innerHTML = `
    <section class="panel">
        <div class="panel-head">
          <h3>Administration Workspace</h3>
          <p>Open only what you need. The admin tools now stay collapsed until you expand a section.</p>
        </div>
        <div class="accordion">
        <details class="accordion-item">
          <summary class="accordion-summary">
            <div>
              <strong>Add User</strong>
              <div class="status-meta">
                <span>Create a new portal account</span>
                <span>Basic auth today, OCI-ready later</span>
              </div>
            </div>
            <span class="pill neutral">New</span>
          </summary>
          <div class="accordion-body">
        <form id="create-user-form" class="check-form">
          <label><span>First Name</span><input name="first_name" /></label>
          <label><span>Last Name</span><input name="last_name" /></label>
          <label><span>Username</span><input name="username" required /></label>
          <label><span>Password</span><input name="password" type="password" required /></label>
          <label>
            <span>Role</span>
            <select name="role">
              <option value="read_only">Read-Only</option>
              <option value="read_write">Read-Write</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label>
            <span>Account State</span>
            <select name="enabled">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <button type="submit">Create User</button>
          <p class="form-status" id="user-create-status"></p>
        </form>
          </div>
        </details>

        <details class="accordion-item" open>
          <summary class="accordion-summary">
            <div>
              <strong>User Accounts</strong>
              <div class="status-meta">
                <span>${users.length} total accounts</span>
                <span>${enabledUsers} enabled</span>
              </div>
            </div>
            ${statusPill(enabledUsers ? "healthy" : "disabled")}
          </summary>
          <div class="accordion-body">
        <div class="stack">
          ${users
            .map(
              (user) => `
                <details class="accordion-item nested-item">
                  <summary class="accordion-summary">
                    <div class="summary-identity">
                      <span class="dot ${user.enabled ? "healthy" : "disabled"}"></span>
                      <div>
                        <strong>${escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" ") || user.username)}</strong>
                        <div class="status-meta">
                          <span>${escapeHtml(user.username)}</span>
                          <span>${escapeHtml(user.role.replaceAll("_", " "))}</span>
                          <span>${user.last_login_at ? `Last login ${fmtTime(user.last_login_at)}` : "No logins yet"}</span>
                        </div>
                      </div>
                    </div>
                    ${statusPill(user.enabled ? "healthy" : "disabled")}
                  </summary>
                  <div class="accordion-body">
                    <form class="check-form user-form" data-username="${escapeHtml(user.username)}">
                    <label><span>First Name</span><input name="first_name" value="${escapeHtml(user.first_name || "")}" /></label>
                    <label><span>Last Name</span><input name="last_name" value="${escapeHtml(user.last_name || "")}" /></label>
                    <label><span>Username</span><input name="username" value="${escapeHtml(user.username)}" required /></label>
                    <label><span>New Password</span><input name="password" type="password" placeholder="Enter a replacement password" required /></label>
                    <label>
                      <span>Role</span>
                      <select name="role">
                        <option value="read_only" ${user.role === "read_only" ? "selected" : ""}>Read-Only</option>
                        <option value="read_write" ${user.role === "read_write" ? "selected" : ""}>Read-Write</option>
                        <option value="admin" ${user.role === "admin" ? "selected" : ""}>Administrator</option>
                      </select>
                    </label>
                    <label>
                      <span>Account State</span>
                      <select name="enabled">
                        <option value="true" ${user.enabled ? "selected" : ""}>Enabled</option>
                        <option value="false" ${!user.enabled ? "selected" : ""}>Disabled</option>
                      </select>
                    </label>
                    <div class="button-row">
                      <button type="submit">Save User</button>
                      <button type="button" class="danger" data-delete-user="${escapeHtml(user.username)}">Delete</button>
                    </div>
                    <p class="form-status"></p>
                  </form>
                  </div>
                </details>
              `
            )
            .join("")}
        </div>
          </div>
        </details>

        <details class="accordion-item">
          <summary class="accordion-summary">
            <div>
              <strong>Telemetry Storage</strong>
              <div class="status-meta">
                <span>${telemetry?.provider === "oci_mysql" ? "OCI MySQL" : "Local MySQL"}</span>
                <span>${telemetry?.retention_hours || 2} hour retention</span>
              </div>
            </div>
            ${statusPill(telemetry?.enabled ? "healthy" : "disabled")}
          </summary>
          <div class="accordion-body">
            <form id="telemetry-form" class="check-form">
              <label>
                <span>Enabled</span>
                <select name="enabled">
                  <option value="true" ${telemetry?.enabled ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!telemetry?.enabled ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>MySQL Target</span>
                <select name="provider">
                  <option value="local_mysql" ${telemetry?.provider === "local_mysql" ? "selected" : ""}>Local MySQL Instance</option>
                  <option value="oci_mysql" ${telemetry?.provider === "oci_mysql" ? "selected" : ""}>OCI Hosted MySQL</option>
                </select>
              </label>
              <label><span>Host</span><input name="host" value="${escapeHtml(telemetry?.host || "")}" placeholder="mysql.example.internal" /></label>
              <label><span>Port</span><input name="port" type="number" min="1" value="${escapeHtml(telemetry?.port || 3306)}" /></label>
              <label><span>Database</span><input name="database" value="${escapeHtml(telemetry?.database || "")}" /></label>
              <label><span>Username</span><input name="username" value="${escapeHtml(telemetry?.username || "")}" /></label>
              <label><span>Password</span><input name="password" type="password" value="${escapeHtml(telemetry?.password || "")}" /></label>
              <label><span>Retention Hours</span><input name="retention_hours" type="number" min="1" max="2" value="${escapeHtml(telemetry?.retention_hours || 2)}" /></label>
              <label>
                <span>Use SSL</span>
                <select name="use_ssl">
                  <option value="true" ${telemetry?.use_ssl ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!telemetry?.use_ssl ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>Provision Local MySQL For Me</span>
                <select name="auto_provision_local">
                  <option value="true" ${telemetry?.auto_provision_local ? "selected" : ""}>Yes, provision it automatically</option>
                  <option value="false" ${!telemetry?.auto_provision_local ? "selected" : ""}>No, I will point to my own server</option>
                </select>
              </label>
              <label><span>Local MySQL Container Name</span><input name="local_container_name" value="${escapeHtml(telemetry?.local_container_name || "async-service-monitor-mysql")}" /></label>
              <button type="submit">Save Telemetry Settings</button>
              <p class="form-status" id="telemetry-status"></p>
            </form>
          </div>
        </details>

        <details class="accordion-item">
          <summary class="accordion-summary">
            <div>
              <strong>Email Notifications</strong>
              <div class="status-meta">
                <span>${escapeHtml(emailSettings?.provider || "custom")}</span>
                <span>${emailSettings?.auto_provision_local ? "Local mail container" : "External email service"}</span>
              </div>
            </div>
            ${statusPill(emailSettings?.enabled ? "healthy" : "disabled")}
          </summary>
          <div class="accordion-body">
            <form id="email-settings-form" class="check-form">
              <label>
                <span>Enabled</span>
                <select name="enabled">
                  <option value="true" ${emailSettings?.enabled ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!emailSettings?.enabled ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>Email Provider</span>
                <select name="provider">
                  <option value="m365" ${emailSettings?.provider === "m365" ? "selected" : ""}>Microsoft 365</option>
                  <option value="yahoo" ${emailSettings?.provider === "yahoo" ? "selected" : ""}>Yahoo Mail</option>
                  <option value="gmail" ${emailSettings?.provider === "gmail" ? "selected" : ""}>Gmail</option>
                  <option value="outlook" ${emailSettings?.provider === "outlook" ? "selected" : ""}>Outlook</option>
                  <option value="custom" ${!emailSettings?.provider || emailSettings?.provider === "custom" ? "selected" : ""}>Custom Email Service</option>
                </select>
              </label>
              <label>
                <span>Provision Local Email Service For Me</span>
                <select name="auto_provision_local">
                  <option value="true" ${emailSettings?.auto_provision_local ? "selected" : ""}>Yes, build and wire a local mail container</option>
                  <option value="false" ${!emailSettings?.auto_provision_local ? "selected" : ""}>No, I will use an existing email service</option>
                </select>
              </label>
              <label><span>SMTP Host</span><input name="host" value="${escapeHtml(emailSettings?.host || "")}" placeholder="smtp.gmail.com" /></label>
              <label><span>SMTP Port</span><input name="port" type="number" min="1" value="${escapeHtml(emailSettings?.port || 587)}" /></label>
              <label><span>Username</span><input name="username" value="${escapeHtml(emailSettings?.username || "")}" placeholder="alerts@example.com" /></label>
              <label><span>Password</span><input name="password" type="password" value="${escapeHtml(emailSettings?.password || "")}" /></label>
              <label><span>From Address</span><input name="from_address" value="${escapeHtml(emailSettings?.from_address || "")}" placeholder="monitor@example.com" /></label>
              <label><span>To Addresses</span><input name="to_addresses" value="${escapeHtml(csv(emailSettings?.to_addresses || []))}" placeholder="admin@example.com, oncall@example.com" /></label>
              <label><span>Subject Prefix</span><input name="subject_prefix" value="${escapeHtml(emailSettings?.subject_prefix || "[async-service-monitor]")}" /></label>
              <label>
                <span>Use STARTTLS</span>
                <select name="use_tls">
                  <option value="true" ${emailSettings?.use_tls !== false ? "selected" : ""}>Enabled</option>
                  <option value="false" ${emailSettings?.use_tls === false ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>Use SSL</span>
                <select name="use_ssl">
                  <option value="true" ${emailSettings?.use_ssl ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!emailSettings?.use_ssl ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label><span>Local Email Container Name</span><input name="local_container_name" value="${escapeHtml(emailSettings?.local_container_name || "async-service-monitor-mailpit")}" /></label>
              <label><span>Local Email UI Port</span><input name="local_ui_port" type="number" min="1" value="${escapeHtml(emailSettings?.local_ui_port || 8025)}" /></label>
              <button type="submit">Save Email Settings</button>
              <p class="form-status" id="email-settings-status"></p>
            </form>
          </div>
        </details>

        <details class="accordion-item">
          <summary class="accordion-summary">
            <div>
              <strong>Portal Authentication</strong>
              <div class="status-meta">
                <span>${portalSettings?.provider === "oci" ? "OCI Auth" : "Basic Auth"}</span>
                <span>${portalSettings?.realm || "Async Service Monitor"}</span>
              </div>
            </div>
            ${statusPill(portalSettings?.enabled ? "healthy" : "disabled")}
          </summary>
          <div class="accordion-body">
            <form id="portal-settings-form" class="check-form">
              <label>
                <span>Portal Auth Enabled</span>
                <select name="enabled">
                  <option value="true" ${portalSettings?.enabled ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!portalSettings?.enabled ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>Provider</span>
                <select name="provider">
                  <option value="basic" ${portalSettings?.provider === "basic" ? "selected" : ""}>Basic Auth</option>
                  <option value="oci" ${portalSettings?.provider === "oci" ? "selected" : ""}>OCI Auth</option>
                </select>
              </label>
              <label><span>Realm</span><input name="realm" value="${escapeHtml(portalSettings?.realm || "Async Service Monitor")}" /></label>
              <label>
                <span>OCI Settings Enabled</span>
                <select name="oci_enabled">
                  <option value="true" ${portalSettings?.oci_enabled ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!portalSettings?.oci_enabled ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label><span>OCI Tenancy OCID</span><input name="tenancy_ocid" value="${escapeHtml(portalSettings?.tenancy_ocid || "")}" /></label>
              <label><span>OCI User OCID</span><input name="user_ocid" value="${escapeHtml(portalSettings?.user_ocid || "")}" /></label>
              <label><span>OCI Region</span><input name="region" value="${escapeHtml(portalSettings?.region || "")}" /></label>
              <label><span>OCI Group Claim</span><input name="group_claim" value="${escapeHtml(portalSettings?.group_claim || "")}" placeholder="groups" /></label>
              <button type="submit">Save Portal Settings</button>
              <p class="form-status" id="portal-settings-status"></p>
            </form>
          </div>
        </details>
        </div>
    </section>
  `;
}

function hydrateFormVisibility(form) {
  const type = form.querySelector("select[name='type']")?.value;
  if (!type) return;
  const showUrl = type === "http" || type === "auth";
  const showHost = type === "dns" || type === "database" || type === "generic";
  const showPort = type === "http" || type === "auth" || type === "database" || type === "generic";
  const showStatuses = type === "http" || type === "auth";
  const showContent = type === "http" || type === "auth";
  const showDatabase = type === "database";
  form.querySelectorAll(".field-url").forEach((node) => node.classList.toggle("hidden", !showUrl));
  form.querySelectorAll(".field-host").forEach((node) => node.classList.toggle("hidden", !showHost));
  form.querySelectorAll(".field-port").forEach((node) => node.classList.toggle("hidden", !showPort));
  form.querySelectorAll(".field-statuses").forEach((node) => node.classList.toggle("hidden", !showStatuses));
  form.querySelectorAll(".field-content").forEach((node) => node.classList.toggle("hidden", !showContent));
  form.querySelectorAll(".database-only").forEach((node) => node.classList.toggle("hidden", !showDatabase));
  const authType = form.querySelector("select[name='auth_type']")?.value || "bearer";
  form.querySelectorAll(".auth-only").forEach((node) => node.classList.toggle("hidden", type !== "auth"));
  form.querySelectorAll("[data-auth-field='token']").forEach((node) => node.classList.toggle("hidden", type !== "auth" || authType !== "bearer"));
  form.querySelectorAll("[data-auth-field='username'], [data-auth-field='password']").forEach((node) => node.classList.toggle("hidden", type !== "auth" || authType !== "basic"));
  form.querySelectorAll("[data-auth-field='header_name'], [data-auth-field='header_value']").forEach((node) => node.classList.toggle("hidden", type !== "auth" || authType !== "header"));
}

function monitorFormPayload(form) {
  const formData = new FormData(form);
  const type = String(formData.get("type"));
  const portValue = String(formData.get("port") || "").trim();
  const databaseUsername = String(formData.get("database_username") || "").trim();
  const databasePassword = String(formData.get("database_password") || "");
  return {
    name: String(formData.get("name")),
    type,
    enabled: String(formData.get("enabled")) === "true",
    interval_seconds: Number(formData.get("interval_seconds")),
    timeout_seconds: formData.get("timeout_seconds") ? Number(formData.get("timeout_seconds")) : null,
    url: formData.get("url") || null,
    host: formData.get("host") || null,
    port: portValue ? Number(portValue) : null,
    database_name: String(formData.get("database_name") || "") || null,
    database_engine: String(formData.get("database_engine") || "mysql"),
    expected_statuses: type === "http" || type === "auth" ? parseCsv(formData.get("expected_statuses")).map(Number) : [200],
    expect_authenticated_statuses: [200],
    content: {
      contains: type === "http" || type === "auth" ? parseCsv(formData.get("contains")) : [],
      not_contains: type === "http" || type === "auth" ? parseCsv(formData.get("not_contains")) : [],
      regex: type === "http" || type === "auth" ? String(formData.get("regex") || "") || null : null,
    },
    auth:
      type === "auth"
        ? {
            type: String(formData.get("auth_type") || "bearer"),
            token: formData.get("token") || null,
            username: formData.get("username") || null,
            password: formData.get("password") || null,
            header_name: formData.get("header_name") || null,
            header_value: formData.get("header_value") || null,
          }
        : type === "database" && databaseUsername
          ? {
              type: "basic",
              token: null,
              username: databaseUsername,
              password: databasePassword || null,
              header_name: null,
              header_value: null,
            }
        : null,
  };
}

function peerFormPayload(form) {
  const formData = new FormData(form);
  return {
    node_id: String(formData.get("node_id")),
    base_url: String(formData.get("base_url")),
    enabled: String(formData.get("enabled")) === "true",
    container_name: formData.get("container_name") || null,
    recovery: {
      enabled: String(formData.get("recovery_enabled")) === "true",
      container_name: formData.get("container_name") || null,
    },
  };
}

function userFormPayload(form) {
  const formData = new FormData(form);
  return {
    username: String(formData.get("username")),
    password: String(formData.get("password")),
    first_name: String(formData.get("first_name") || ""),
    last_name: String(formData.get("last_name") || ""),
    role: String(formData.get("role")),
    enabled: String(formData.get("enabled")) === "true",
  };
}

function telemetryFormPayload(form) {
  const formData = new FormData(form);
  return {
    enabled: String(formData.get("enabled")) === "true",
    provider: String(formData.get("provider")),
    host: String(formData.get("host") || "") || null,
    port: Number(formData.get("port") || 3306),
    database: String(formData.get("database") || "") || null,
    username: String(formData.get("username") || "") || null,
    password: String(formData.get("password") || "") || null,
    retention_hours: Number(formData.get("retention_hours") || 2),
    use_ssl: String(formData.get("use_ssl")) === "true",
    auto_provision_local: String(formData.get("auto_provision_local")) === "true",
    local_container_name: String(formData.get("local_container_name") || "") || "async-service-monitor-mysql",
  };
}

function portalSettingsPayload(form) {
  const formData = new FormData(form);
  return {
    enabled: String(formData.get("enabled")) === "true",
    provider: String(formData.get("provider")),
    realm: String(formData.get("realm") || "Async Service Monitor"),
    oci_enabled: String(formData.get("oci_enabled")) === "true",
    tenancy_ocid: String(formData.get("tenancy_ocid") || "") || null,
    user_ocid: String(formData.get("user_ocid") || "") || null,
    region: String(formData.get("region") || "") || null,
    group_claim: String(formData.get("group_claim") || "") || null,
  };
}

function emailSettingsPayload(form) {
  const formData = new FormData(form);
  return {
    enabled: String(formData.get("enabled")) === "true",
    provider: String(formData.get("provider") || "custom"),
    host: String(formData.get("host") || "") || null,
    port: Number(formData.get("port") || 587),
    username: String(formData.get("username") || "") || null,
    password: String(formData.get("password") || "") || null,
    from_address: String(formData.get("from_address") || "") || null,
    to_addresses: parseCsv(formData.get("to_addresses") || ""),
    subject_prefix: String(formData.get("subject_prefix") || "[async-service-monitor]"),
    use_tls: String(formData.get("use_tls")) === "true",
    use_ssl: String(formData.get("use_ssl")) === "true",
    auto_provision_local: String(formData.get("auto_provision_local")) === "true",
    local_container_name: String(formData.get("local_container_name") || "") || "async-service-monitor-mailpit",
    local_ui_port: Number(formData.get("local_ui_port") || 8025),
  };
}

function hydrateEmailSettingsForm(form) {
  if (!form) return;
  const autoProvision = form.querySelector("select[name='auto_provision_local']")?.value === "true";
  const provider = form.querySelector("select[name='provider']")?.value || "custom";
  const hostInput = form.querySelector("input[name='host']");
  const portInput = form.querySelector("input[name='port']");
  const tlsSelect = form.querySelector("select[name='use_tls']");
  const sslSelect = form.querySelector("select[name='use_ssl']");
  const defaults = EMAIL_PROVIDER_DEFAULTS[provider] || EMAIL_PROVIDER_DEFAULTS.custom;

  if (autoProvision) {
    hostInput.value = "127.0.0.1";
    portInput.value = "1025";
    tlsSelect.value = "false";
    sslSelect.value = "false";
  } else if (!hostInput.value || Object.values(EMAIL_PROVIDER_DEFAULTS).some((item) => item.host === hostInput.value)) {
    hostInput.value = defaults.host;
    portInput.value = String(defaults.port);
    tlsSelect.value = defaults.use_tls ? "true" : "false";
    sslSelect.value = defaults.use_ssl ? "true" : "false";
  }
}

function setStatus(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("error-text", isError);
}

function isInteractiveRoute(path = window.location.pathname) {
  return (
    path === "/monitors/new" ||
    path.startsWith("/monitors/") ||
    path === "/profile" ||
    path === "/admin" ||
    path === "/cluster/configure" ||
    path.startsWith("/cluster/")
  );
}

async function renderRoute() {
  state.session = await api("/api/session");
  applyTheme();
  renderSessionChip();

  const path = window.location.pathname;
  if (path.startsWith("/monitors/") && path !== "/monitors/new") {
    state.monitorsExpanded = true;
  }
  if (path.startsWith("/cluster") || path === "/containers") {
    state.clusterExpanded = true;
  }
  if (!state.session?.authenticated) {
    renderSidebar([], { available: false, containers: [] });
    renderLoginPage();
    return;
  }

  const [overview, checks] = await Promise.all([api("/api/overview"), api("/api/checks")]);
  const summaryCounts = renderOverview(overview, checks);
  const containersData = hasRole("admin")
    ? await api("/api/containers").catch(() => ({ available: false, containers: [] }))
    : { available: false, containers: [] };
  renderSidebar(checks, containersData);

  if (path === "/" || path === "/monitors") {
    const [checkMetrics, nodeMetrics, cluster] = await Promise.all([
      api("/api/metrics/checks"),
      api("/api/metrics/nodes"),
      api("/api/cluster"),
    ]);
    renderDashboard(overview, checks, summaryCounts, checkMetrics, nodeMetrics, cluster);
    return;
  }

  if (path === "/guide") {
    renderGuidePage();
    return;
  }

  if (path === "/profile") {
    const profile = await api("/api/profile");
    renderProfilePage(profile);
    return;
  }

  if (path === "/admin") {
    if (!hasRole("admin")) {
      navigate("/");
      return;
    }
    const [users, telemetry, portalSettings, emailSettings] = await Promise.all([
      api("/api/users"),
      api("/api/settings/telemetry"),
      api("/api/settings/portal"),
      api("/api/settings/email"),
    ]);
    renderAdminPage(users, telemetry, portalSettings, emailSettings);
    hydrateEmailSettingsForm(document.getElementById("email-settings-form"));
    return;
  }

  if (path === "/monitors/new") {
    setWorkspaceHeader("Add Monitor", "Create a new endpoint monitor with its own health rules and authentication.");
    document.getElementById("app-root").innerHTML = monitorFormMarkup(
      {
        name: "",
        type: "http",
        enabled: true,
        interval_seconds: 300,
        timeout_seconds: 10,
        port: null,
        database_name: "",
        database_engine: "mysql",
        expected_statuses: [200],
        content_rules: { contains: [], not_contains: [], regex: "" },
        status: "unknown",
        metric_points: [],
      },
      "create"
    );
    const form = document.getElementById("monitor-form");
    hydrateFormVisibility(form);
    if (!hasRole("read_write")) {
      disableForm(form, true);
    }
    return;
  }

  if (path.startsWith("/monitors/")) {
    const name = decodeURIComponent(path.split("/").pop());
    const [check, checkMetrics] = await Promise.all([
      api(`/api/checks/${encodeURIComponent(name)}`),
      api("/api/metrics/checks"),
    ]);
    check.metric_points = checkMetrics[check.name] || [];
    setWorkspaceHeader(check.name, "Dedicated monitor page for editing, auth updates, and immediate re-checks.");
    document.getElementById("app-root").innerHTML = monitorFormMarkup(check, "edit");
    const form = document.getElementById("monitor-form");
    hydrateFormVisibility(form);
    if (!hasRole("read_write")) {
      disableForm(form, true);
      setStatus(document.getElementById("monitor-form-status"), "Read-only access: editing is disabled for this account.");
    }
    return;
  }

  if (path === "/containers" || path === "/cluster/configure" || path === "/cluster") {
    const [peers, containers, nodeMetrics] = await Promise.all([
      api("/api/peers"),
      api("/api/containers"),
      api("/api/metrics/nodes"),
    ]);
    renderContainersPage(peers, containers, nodeMetrics);
    return;
  }

  if (path.startsWith("/cluster/")) {
    const containerName = decodeURIComponent(path.split("/").pop());
    const [peers, containers, nodeMetrics] = await Promise.all([
      api("/api/peers"),
      api("/api/containers"),
      api("/api/metrics/nodes"),
    ]);
    const container = (containers.available ? containers.containers : []).find((item) => item.name === containerName);
    if (!container) {
      navigate("/cluster/configure");
      return;
    }
    const peer = peers.find((item) => item.container_name === containerName || item.node_id === containerName);
    renderContainerDetailPage(container, peer, nodeMetrics);
  }
}

function navigate(url) {
  window.history.pushState({}, "", url);
  renderRoute().catch((error) => alert(error.message));
}

async function handleSubmit(event) {
  if (event.target.id === "login-form") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const status = document.getElementById("login-status");
    try {
      setStatus(status, "Signing in...");
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username")),
          password: String(data.get("password")),
        }),
      });
      navigate("/");
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "register-form") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const status = document.getElementById("register-status");
    try {
      setStatus(status, "Creating account...");
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username")),
          password: String(data.get("password")),
          first_name: String(data.get("first_name") || ""),
          last_name: String(data.get("last_name") || ""),
        }),
      });
      setStatus(status, "Account created. You can sign in now.");
      form.reset();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "reset-password-form") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const status = document.getElementById("reset-password-status");
    try {
      setStatus(status, "Resetting password...");
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username")),
          password: String(data.get("password")),
        }),
      });
      setStatus(status, "Password reset. You can sign in with the new password.");
      form.reset();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "profile-form") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const status = document.getElementById("profile-status");
    try {
      setStatus(status, "Saving profile...");
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          first_name: String(data.get("first_name") || ""),
          last_name: String(data.get("last_name") || ""),
          password: String(data.get("password") || "") || null,
          dark_mode: String(data.get("dark_mode")) === "true",
        }),
      });
      await renderRoute();
      setStatus(document.getElementById("profile-status"), "Profile updated.");
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "telemetry-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = document.getElementById("telemetry-status");
    try {
      setStatus(status, "Saving telemetry settings...");
      const result = await api("/api/settings/telemetry", {
        method: "PUT",
        body: JSON.stringify(telemetryFormPayload(form)),
      });
      setStatus(status, result.message || "Telemetry settings saved.");
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "portal-settings-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = document.getElementById("portal-settings-status");
    try {
      setStatus(status, "Saving portal settings...");
      await api("/api/settings/portal", {
        method: "PUT",
        body: JSON.stringify(portalSettingsPayload(form)),
      });
      setStatus(status, "Portal settings saved.");
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "email-settings-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = document.getElementById("email-settings-status");
    try {
      setStatus(status, "Saving email settings...");
      const result = await api("/api/settings/email", {
        method: "PUT",
        body: JSON.stringify(emailSettingsPayload(form)),
      });
      setStatus(status, result.message || "Email settings saved.");
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "monitor-form") {
    event.preventDefault();
    if (!hasRole("read_write")) return;
    const form = event.target;
    const status = document.getElementById("monitor-form-status");
    const isNew = window.location.pathname === "/monitors/new";
    try {
      setStatus(status, isNew ? "Creating monitor..." : "Saving monitor and re-running...");
      const payload = monitorFormPayload(form);
      if (isNew) {
        await api("/api/checks", { method: "POST", body: JSON.stringify(payload) });
        navigate(`/monitors/${encodeURIComponent(payload.name)}`);
      } else {
        const originalName = form.dataset.originalName;
        await api(`/api/checks/${encodeURIComponent(originalName)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (payload.name !== originalName) {
          navigate(`/monitors/${encodeURIComponent(payload.name)}`);
        } else {
          await renderRoute();
        }
      }
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.matches(".peer-form")) {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = form.querySelector(".form-status");
    try {
      setStatus(status, "Saving peer...");
      await api(`/api/peers/${encodeURIComponent(form.dataset.peerId)}`, {
        method: "PUT",
        body: JSON.stringify(peerFormPayload(form)),
      });
      await renderRoute();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "create-peer-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = document.getElementById("peer-create-status");
    try {
      setStatus(status, "Adding peer...");
      await api("/api/peers", { method: "POST", body: JSON.stringify(peerFormPayload(form)) });
      form.reset();
      await renderRoute();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "create-container-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const data = new FormData(form);
    const status = document.getElementById("container-create-status");
    try {
      setStatus(status, "Creating container...");
      await api("/api/containers", {
        method: "POST",
        body: JSON.stringify({
          node_id: String(data.get("node_id")),
          container_name: String(data.get("container_name")),
          image: String(data.get("image")),
          base_url: String(data.get("base_url")),
          network: data.get("network") || null,
          host_port: data.get("host_port") ? Number(data.get("host_port")) : null,
          enabled: true,
          recovery_enabled: true,
        }),
      });
      form.reset();
      await renderRoute();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "create-user-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = document.getElementById("user-create-status");
    try {
      setStatus(status, "Creating user...");
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify(userFormPayload(form)),
      });
      form.reset();
      await renderRoute();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.matches(".user-form")) {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = form.querySelector(".form-status");
    try {
      setStatus(status, "Saving user...");
      await api(`/api/users/${encodeURIComponent(form.dataset.username)}`, {
        method: "PUT",
        body: JSON.stringify(userFormPayload(form)),
      });
      await renderRoute();
    } catch (error) {
      setStatus(status, error.message, true);
    }
  }
}

async function handleClick(event) {
  const link = event.target.closest("[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }

  if (event.target.closest("#configured-monitors-toggle")) {
    state.monitorsExpanded = !state.monitorsExpanded;
    await renderRoute();
    return;
  }

  if (event.target.closest("#cluster-toggle")) {
    state.clusterExpanded = !state.clusterExpanded;
    await renderRoute();
    return;
  }

  if (event.target.id === "logout-btn") {
    await api("/api/auth/logout", { method: "POST" });
    navigate("/");
    return;
  }

  if (event.target.id === "toggle-monitor-btn") {
    if (!hasRole("read_write")) return;
    const form = document.getElementById("monitor-form");
    const originalName = form.dataset.originalName;
    const enabled = form.querySelector("select[name='enabled']").value !== "true";
    await api(`/api/checks/${encodeURIComponent(originalName)}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await renderRoute();
    return;
  }

  if (event.target.id === "delete-monitor-btn") {
    if (!hasRole("read_write")) return;
    const form = document.getElementById("monitor-form");
    const originalName = form.dataset.originalName;
    if (!window.confirm(`Delete monitor "${originalName}"?`)) return;
    await api(`/api/checks/${encodeURIComponent(originalName)}`, { method: "DELETE" });
    navigate("/");
    return;
  }

  const togglePeer = event.target.closest("[data-toggle-peer]");
  if (togglePeer) {
    if (!hasRole("admin")) return;
    await api(`/api/peers/${encodeURIComponent(togglePeer.dataset.togglePeer)}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: togglePeer.dataset.enabled !== "true" }),
    });
    await renderRoute();
    return;
  }

  const deletePeer = event.target.closest("[data-delete-peer]");
  if (deletePeer) {
    if (!hasRole("admin")) return;
    if (!window.confirm(`Delete peer "${deletePeer.dataset.deletePeer}"?`)) return;
    await api(`/api/peers/${encodeURIComponent(deletePeer.dataset.deletePeer)}`, { method: "DELETE" });
    await renderRoute();
    return;
  }

  const deleteUser = event.target.closest("[data-delete-user]");
  if (deleteUser) {
    if (!hasRole("admin")) return;
    if (!window.confirm(`Delete user "${deleteUser.dataset.deleteUser}"?`)) return;
    await api(`/api/users/${encodeURIComponent(deleteUser.dataset.deleteUser)}`, { method: "DELETE" });
    await renderRoute();
    return;
  }

  const containerAction = event.target.closest("[data-action]");
  if (containerAction) {
    if (!hasRole("admin")) return;
    await api(`/api/containers/${encodeURIComponent(containerAction.dataset.container)}/${containerAction.dataset.action}`, {
      method: "POST",
    });
    await renderRoute();
  }
}

function handleChange(event) {
  if (event.target.matches("select[name='type'], select[name='auth_type']")) {
    hydrateFormVisibility(event.target.closest("form"));
    return;
  }

  if (
    event.target.matches("#email-settings-form select[name='provider']") ||
    event.target.matches("#email-settings-form select[name='auto_provision_local']")
  ) {
    hydrateEmailSettingsForm(event.target.closest("form"));
  }
}

function boot() {
  document.addEventListener("click", (event) => handleClick(event).catch((error) => alert(error.message)));
  document.addEventListener("submit", (event) => handleSubmit(event).catch((error) => alert(error.message)));
  document.addEventListener("change", handleChange);
  window.addEventListener("popstate", () => renderRoute().catch((error) => alert(error.message)));
  renderRoute().catch((error) => alert(error.message));
  state.pollingHandle = setInterval(() => {
    if (isInteractiveRoute()) {
      return;
    }
    renderRoute().catch(() => {});
  }, 10000);
}

window.addEventListener("DOMContentLoaded", boot);
