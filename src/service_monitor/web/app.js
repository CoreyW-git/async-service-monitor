function createRecorderState() {
  return {
    sessionId: null,
    mode: "in_app",
    targetUrl: "",
    steps: [],
    lastPageUrl: "",
    status: "",
    fallbackSuggested: false,
    fallbackReason: "",
    playwrightSessionId: null,
    playwrightStatus: "",
    playwrightError: "",
    playwrightBrowserOpen: false,
    playwrightPollHandle: null,
    playwrightLaunchInFlight: false,
    lastTestResult: null,
  };
}

const state = {
  pollingHandle: null,
  session: null,
  clusterExpanded: false,
  dashboardRunDiagnostics: {},
  configuredMonitors: {
    query: "",
    type: "all",
    enabled: "all",
  },
  dashboardPanels: {
    enabledMonitors: false,
    monitoringNodes: false,
    disabledMonitors: false,
  },
  dashboardWorkspace: {
    query: "",
    status: "all",
    type: "all",
  },
  helpWorkspace: {
    query: "",
  },
  dashboardDetailContext: null,
  basicMonitorBuilder: {
    lastTestResult: null,
  },
  browserMonitorBuilder: {
    lastTestResult: null,
  },
  recorder: createRecorderState(),
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

const HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    summary: "First-time setup, login, navigation, and the operator workflow.",
  },
  {
    id: "architecture",
    title: "Architecture",
    summary: "Platform architecture, monitor lifecycle, cluster behavior, and telemetry design.",
  },
  {
    id: "monitors",
    title: "Monitors",
    summary: "How to build endpoint, browser, and recorded synthetic monitors.",
  },
  {
    id: "operations",
    title: "Operations",
    summary: "Dashboards, troubleshooting, cluster placement, and live container health.",
  },
  {
    id: "administration",
    title: "Administration",
    summary: "Users, roles, telemetry, email, scaling, and security settings.",
  },
  {
    id: "deployment",
    title: "Deployment",
    summary: "Local, Docker, Kubernetes, Helm, cloud-provider, and offline deployment guidance.",
  },
  {
    id: "libraries",
    title: "Third-Party Libraries",
    summary: "Runtime, frontend, and optional documentation libraries used by the platform.",
  },
];

const THIRD_PARTY_LIBRARIES = [
  { name: "FastAPI", area: "Web API and SPA host", declared: ">=0.116.0,<1.0.0", version: "0.135.1", license: "Project metadata does not expose a simple SPDX string in this environment", url: "https://github.com/fastapi/fastapi" },
  { name: "Uvicorn", area: "ASGI server", declared: ">=0.35.0,<1.0.0", version: "0.42.0", license: "Project metadata does not expose a simple SPDX string in this environment", url: "https://uvicorn.dev/release-notes" },
  { name: "HTTPX", area: "Async HTTP client for checks and recorder proxying", declared: ">=0.27.0,<1.0.0", version: "0.28.1", license: "BSD-3-Clause", url: "https://github.com/encode/httpx/blob/master/CHANGELOG.md" },
  { name: "cryptography", area: "Secret handling and config encryption", declared: ">=44.0.0,<46.0.0", version: "45.0.7", license: "Apache-2.0 OR BSD-3-Clause", url: "https://github.com/pyca/cryptography" },
  { name: "docker", area: "Docker Engine integration for container and recovery operations", declared: ">=7.1.0,<8.0.0", version: "7.1.0", license: "Apache Software License", url: "https://docker-py.readthedocs.io/en/stable/change-log.html" },
  { name: "PyYAML", area: "Config file parsing", declared: ">=6.0.1,<7.0.0", version: "6.0.3", license: "MIT", url: "https://pyyaml.org/" },
  { name: "Playwright", area: "Browser health monitors and Chromium recorder", declared: ">=1.53.0,<2.0.0", version: "1.58.0", license: "Project metadata does not expose a simple SPDX string in this environment", url: "https://github.com/Microsoft/playwright-python" },
  { name: "PyMySQL", area: "Legacy MySQL compatibility path still present in the codebase", declared: ">=1.1.1,<2.0.0", version: "1.1.2", license: "Project metadata does not expose a simple SPDX string in this environment", url: "https://github.com/PyMySQL/PyMySQL" },
  { name: "psycopg", area: "PostgreSQL telemetry storage", declared: ">=3.2.1,<4.0.0", version: "Not installed in this desktop environment", license: "See runtime package metadata when installed", url: "https://www.psycopg.org/" },
  { name: "MinIO Python SDK", area: "Object storage diagnostics retention", declared: ">=7.2.8,<8.0.0", version: "Not installed in this desktop environment", license: "See runtime package metadata when installed", url: "https://min.io/" },
  { name: "Plotly Python", area: "Interactive charting support and local asset source", declared: "local dependency for offline Plotly enablement", version: "6.6.0", license: "MIT", url: "https://plotly.com/python/" },
  { name: "plotly.js", area: "Vendored local interactive graph bundle", declared: "vendored asset", version: "3.4.0", license: "MIT", url: "https://plotly.com/javascript/" },
  { name: "Diagrams", area: "Optional help and architecture diagram generation", declared: "optional docs dependency >=0.24.4,<1.0.0", version: "Not installed in this desktop environment", license: "See runtime package metadata when installed", url: "https://diagrams.mingrammer.com/" },
];

const HELP_TOPICS = [
  {
    id: "getting-started",
    section: "getting-started",
    title: "Start Here",
    summary: "A first-time operator path from login to a useful first monitor.",
    keywords: ["first login", "onboarding", "new user", "start", "quick start"],
    content: () => `
      <h3>Who This Topic Is For</h3>
      <p>Use this page if you have never used the portal before or if you want the shortest path to getting a monitor working and visible on the dashboards.</p>
      <h3>Recommended First Workflow</h3>
      <ol class="help-numbered-list">
        <li>Sign in and land on <strong>Home</strong> to confirm the service is up.</li>
        <li>Open <strong>Monitors</strong>, choose <strong>Add Monitor</strong>, then start with the <strong>Basic Monitor Builder</strong>.</li>
        <li>Select a request type such as HTTP, API, DNS, Database, or Generic, define the request, and run a live test before you save.</li>
        <li>Use the right-side live test console to review the request preview, response preview, body content, and assertion results.</li>
        <li>Save the monitor and immediately open its dedicated dashboard to review availability, latency, and error signals.</li>
        <li>Use <strong>Administration</strong> only after the first monitor works so storage, email, and scaling changes are easier to validate.</li>
      </ol>
      <div class="help-callout">
        <strong>Best first monitor:</strong>
        <p>An HTTP or API monitor against an internal health endpoint is the easiest way to validate the platform end to end because you can test the request, define assertions, and immediately see the results in the live console.</p>
      </div>
      <h3>Where To Go Next</h3>
      <div class="help-link-grid">
        <a class="button-link" href="${guideTopicHref("monitors", "basic-monitors")}" data-link>Build Basic Monitors</a>
        <a class="button-link secondary" href="${guideTopicHref("operations", "dashboards-and-troubleshooting")}" data-link>Read Dashboards</a>
        <a class="button-link secondary" href="${guideTopicHref("administration", "administration-workspace")}" data-link>Admin Guide</a>
      </div>
    `,
  },
  {
    id: "architecture-overview",
    section: "architecture",
    title: "Architecture Overview",
    summary: "A deeper walkthrough of the platform design, diagram by diagram.",
    keywords: ["architecture", "design", "diagram", "telemetry", "cluster", "lifecycle"],
    content: () => `
      <h3>How To Read This Section</h3>
      <p>This architecture section explains how the platform is assembled, why the major layers are separated, and how the diagrams map to real operator workflows inside the portal.</p>
      <h3>1. Platform Architecture</h3>
      ${helpDiagramCardMarkup("/help-assets/architecture-overview.svg", "Architecture overview diagram", "Platform Architecture", "Click to expand this diagram and inspect the full control plane, runner, target, and telemetry flow.")}
      <p>The core platform has five main layers:</p>
      <ul class="help-bullet-list">
        <li><strong>Admin Portal</strong> is the operator-facing UI for Home, Dashboards, Monitors, Administration, and Help.</li>
        <li><strong>Config Store</strong> persists monitor definitions, users, portal settings, service configuration, and encrypted secrets.</li>
        <li><strong>Monitor Runner</strong> owns async execution, scheduling, placement, cluster participation, recovery logic, and notifications.</li>
        <li><strong>Targets</strong> are the services being monitored, including HTTP endpoints, DNS targets, databases, and browser journeys.</li>
        <li><strong>Live plus retained telemetry</strong> feeds Home, dashboards, troubleshooting, and historical investigation.</li>
      </ul>
      <h3>2. Monitor Lifecycle</h3>
      ${helpDiagramCardMarkup("/help-assets/monitor-lifecycle.svg", "Monitor lifecycle diagram", "Monitor Lifecycle", "Click to expand the operator workflow from creating a monitor through tuning it over time.")}
      <p>Monitors are designed to be iterative. They are not just created once and forgotten.</p>
      <ol class="help-numbered-list">
        <li><strong>Create</strong> a monitor from a basic form, browser monitor, or recorded journey.</li>
        <li><strong>Place</strong> it automatically or pin it to a specific monitoring node when locality matters.</li>
        <li><strong>Execute</strong> it on schedule with auth, validation, and browser steps when needed.</li>
        <li><strong>Observe</strong> it through dashboards, diagnostics, and run history.</li>
        <li><strong>Tune</strong> thresholds, session handling, validation rules, or placement as the target evolves.</li>
      </ol>
      <h3>3. Telemetry Data Layer</h3>
      ${helpDiagramCardMarkup("/help-assets/telemetry-data-layer.svg", "Telemetry data layer diagram", "Telemetry Data Layer", "Click to expand the data-layer split between time-series metrics and richer diagnostics.")}
      <p>The data layer is intentionally split:</p>
      <ul class="help-bullet-list">
        <li><strong>PostgreSQL</strong> retains hot operational time-series such as latency, availability, error counts, and run metadata.</li>
        <li><strong>MinIO / OCI Object Storage</strong> retains heavier troubleshooting artifacts such as diagnostics, snapshots, and larger run payloads.</li>
        <li><strong>In-memory state</strong> keeps the portal responsive for current status and recent activity even before retained telemetry is queried.</li>
      </ul>
      <div class="help-callout">
        <strong>Why the split matters:</strong>
        <p>This design keeps dashboards fast, makes the troubleshooting path richer, and makes it easier to move fully into OCI later without redesigning the entire observability model.</p>
      </div>
      <h3>How The Architecture Maps To The UI</h3>
      <ul class="help-bullet-list">
        <li><strong>Home</strong> reads current fleet state for high-level health.</li>
        <li><strong>Dashboards</strong> read richer monitor history and diagnostics for APM-style investigation.</li>
        <li><strong>Monitors</strong> modify the configuration and execution plan.</li>
        <li><strong>Administration</strong> controls the platform-level services the architecture depends on.</li>
      </ul>
    `,
  },
  {
    id: "portal-navigation",
    section: "getting-started",
    title: "Portal Navigation",
    summary: "How Home, Dashboards, Monitors, Administration, and Profile fit together.",
    keywords: ["navigation", "home", "dashboards", "monitors", "cluster", "profile", "sidebar", "administration"],
    content: () => `
      <h3>Portal Map</h3>
      <div class="help-example-grid">
        <article class="help-example-card">
          <h4>Home</h4>
          <p>High-level service health with enabled monitors, disabled monitors, and monitoring-node health.</p>
        </article>
        <article class="help-example-card">
          <h4>Dashboards</h4>
          <p>APM-style observability for each monitor with latency, availability, error trends, SLOs, and diagnostics.</p>
        </article>
        <article class="help-example-card">
          <h4>Monitors</h4>
          <p>Use the monitor builders to create Basic and Advanced monitors, define assertions, test requests, record browser journeys, and control placement.</p>
        </article>
        <article class="help-example-card">
          <h4>Administration</h4>
          <p>Use dedicated admin pages for User Administration, Application Configuration, and Cluster And Containers.</p>
        </article>
        <article class="help-example-card">
          <h4>Personal Settings</h4>
          <p>Update your profile, password, and user theme preferences.</p>
        </article>
      </div>
      <h3>Operator Pattern</h3>
      <p>Most operators spend the majority of their time in this loop: <strong>Monitors</strong> to create, <strong>Dashboards</strong> to validate and troubleshoot, and <strong>Home</strong> to watch fleet status.</p>
    `,
  },
  {
    id: "basic-monitors",
    section: "monitors",
    title: "Build Basic Monitors",
    summary: "How to use the Basic Monitor builder for HTTP, API, DNS, Auth, Database, and Generic monitors.",
    keywords: ["basic monitor", "builder", "http", "api", "dns", "auth", "database", "generic", "examples", "port"],
    content: () => `
      <h3>How The Basic Monitor Builder Works</h3>
      <ol class="help-numbered-list">
        <li><strong>Select Request Type</strong> to choose the monitor family you want to build.</li>
        <li><strong>Define Request</strong> to provide the URL, host, path, port, method, headers, or body needed for the test.</li>
        <li><strong>Test Request</strong> to validate the target before you save it.</li>
        <li><strong>Define Assertions</strong> to set status-code, response-time, response-header, body, or content expectations.</li>
        <li><strong>Define Retry Conditions</strong> for retry counts, delays, and retryable status codes.</li>
        <li><strong>Define Scheduling And Alert Conditions</strong> for interval, placement, and threshold behavior.</li>
        <li><strong>Configure The Monitor</strong> to name it and create it.</li>
      </ol>
      <div class="help-callout">
        <strong>Live Test Console:</strong>
        <p>The right-side panel shows the full request preview, response preview, response body, and assertion outcomes while you are building the monitor. Use it before you click create.</p>
      </div>
      <h3>Available Basic Monitor Types</h3>
      <div class="help-example-grid">
        <article class="help-example-card">
          <h4>HTTP</h4>
          <p>Checks URL availability, response codes, content rules, and custom ports.</p>
          <pre class="mono">Name: Public Home
Type: HTTP
          URL: https://example.com
          Port: 443
          Expected Statuses: 200
          Contains Text: Welcome</pre>
        </article>
        <article class="help-example-card">
          <h4>API</h4>
          <p>Best for request-and-response validation when you need methods, headers, request bodies, header assertions, and response-time rules.</p>
          <pre class="mono">Name: Orders API
Type: API
Method: POST
URL: https://api.example.com/orders/search
Headers: Authorization, Content-Type
Expected Status: 200
Max Response Time: 800 ms</pre>
        </article>
        <article class="help-example-card">
          <h4>DNS</h4>
          <p>Validates that a hostname resolves and that DNS remains available.</p>
          <pre class="mono">Name: Corporate DNS
Type: DNS
Host: intranet.example.internal
Interval: 300</pre>
        </article>
        <article class="help-example-card">
          <h4>Auth</h4>
          <p>Runs an HTTP-style monitor with bearer, basic, or custom header authentication.</p>
          <pre class="mono">Name: Auth API
Type: Auth
URL: https://api.example.com/v1/profile
Auth: Bearer token</pre>
        </article>
        <article class="help-example-card">
          <h4>Database</h4>
          <p>Validates connectivity to a database endpoint and tracks it as a database signal on the dashboards.</p>
          <pre class="mono">Name: Orders DB
Type: Database
Host: db.internal
Port: 5432
Database Name: orders</pre>
        </article>
        <article class="help-example-card">
          <h4>Generic</h4>
          <p>Checks a host and port when you need simple reachability without HTTP-specific assumptions.</p>
          <pre class="mono">Name: Cache TCP Port
Type: Generic
Host: cache.internal
Port: 6379</pre>
        </article>
      </div>
      <h3>Important Configuration Choices</h3>
      <ul class="help-bullet-list">
        <li><strong>Port</strong> is available anywhere a service might not use a default port.</li>
        <li><strong>API request definitions</strong> support HTTP method, headers, and request body so the monitor can reflect a real API call instead of a shallow ping.</li>
        <li><strong>Placement</strong> controls whether a monitor is auto-balanced or pinned to a specific monitoring node.</li>
        <li><strong>Alert Thresholds</strong> can be learned automatically or set manually per monitor.</li>
        <li><strong>Validation Rules</strong> should be strict enough to catch regressions but not so strict that harmless copy changes create noise.</li>
      </ul>
    `,
  },
  {
    id: "browser-monitoring",
    section: "monitors",
    title: "Browser Health Monitoring",
    summary: "Synthetic browser journeys, page validation, network capture, and session-aware runs.",
    keywords: ["browser health", "synthetic", "journey", "playwright", "chromium", "network", "har"],
    content: () => `
      <h3>What Browser Health Monitors Do</h3>
      <p>Browser monitors go beyond availability. They open a page, wait for content, execute journey steps, record timing, and capture browser-specific diagnostics such as failed requests and console errors.</p>
      <h3>What To Configure</h3>
      <ul class="help-bullet-list">
        <li>Target page URL and optional custom port</li>
        <li>Viewport size for the synthetic browser session</li>
        <li>Expected page title fragments</li>
        <li>Required selectors that must render for success</li>
        <li>Journey steps such as navigate, click, fill, press, and assertions</li>
        <li>Optional authenticated session reuse for continuous runs</li>
        <li>Per-monitor alert thresholds in either auto-learned or manual mode</li>
      </ul>
      <div class="help-callout">
        <strong>Use Browser Health when:</strong>
        <p>You need to know whether the page experience is truly working, not just whether the endpoint returned a 200.</p>
      </div>
      <h3>What Appears On The Dashboard</h3>
      <p>Browser dashboards surface P50, average, P95, and P99 latency trends, availability, error trends, step-level outcomes, session diagnostics, network diagnostics, and downloadable HAR-style files for deeper investigation.</p>
    `,
  },
  {
    id: "monitor-recorder",
    section: "monitors",
    title: "Monitor Recorder",
    summary: "Record clicks, form fills, and navigation as a synthetic browser monitor.",
    keywords: ["recorder", "record", "browser recorder", "embedded", "chromium recorder", "auth session"],
    content: () => `
      <h3>Recorder Modes</h3>
      <div class="help-example-grid">
        <article class="help-example-card">
          <h4>Embedded Recorder</h4>
          <p>Fastest option for internal pages and simpler sites that work well inside the app.</p>
        </article>
        <article class="help-example-card">
          <h4>Desktop Chromium Recorder</h4>
          <p>Best choice when the target site uses bot protection, popup behavior, or more advanced browser flows that do not behave well inside the embedded view.</p>
        </article>
      </div>
      <h3>Recommended Workflow</h3>
      <ol class="help-numbered-list">
        <li>Open <strong>Monitors → Add Monitor → Advanced Monitor → Monitor Recorder</strong>.</li>
        <li>Enter the target URL and start with the embedded recorder.</li>
        <li>If the page is blocked, rate limited, or starts behaving badly inside the embedded view, switch to <strong>Use Chromium Recorder</strong>.</li>
        <li>Click through the journey, including login if needed.</li>
        <li>Choose whether to persist the authenticated browser session for future scheduled runs.</li>
        <li>Test the journey, then save it as a browser monitor.</li>
      </ol>
      <h3>What The Desktop Recorder Does Differently</h3>
      <ul class="help-bullet-list">
        <li>Launches a separate visible browser helper in your desktop session.</li>
        <li>Keeps the recorder focused on one controlled page even when a site attempts to open new tabs or popups.</li>
        <li>Streams recorded steps, page navigation, and captured browser session state back into the portal.</li>
      </ul>
      <h3>Authentication Notes</h3>
      <p>The recorder can capture browser session state and reuse it later. You can also update the stored browser session manually on the saved monitor page without recreating the entire monitor.</p>
    `,
  },
  {
    id: "dashboards-and-troubleshooting",
    section: "operations",
    title: "Dashboards and Troubleshooting",
    summary: "How to read the APM-style dashboards and use them to investigate failures.",
    keywords: ["dashboard", "latency", "p50", "p95", "p99", "errors", "slo", "har", "troubleshooting"],
    content: () => `
      <h3>What The Dashboards Track</h3>
      <ul class="help-bullet-list">
        <li><strong>Availability</strong> shows whether the monitor is succeeding over time.</li>
        <li><strong>Latency</strong> shows P50, average, P95, and P99 performance characteristics.</li>
        <li><strong>Error Trend</strong> counts failures and smaller browser/runtime errors separately from full outages.</li>
        <li><strong>Traffic</strong> shows how many monitor runs are contributing to the current window.</li>
      </ul>
      <h3>Four Golden Signals In This Portal</h3>
      <ul class="help-bullet-list">
        <li><strong>Latency</strong> is shown through the latency trend and percentile cards.</li>
        <li><strong>Traffic</strong> is approximated by monitor run volume in the selected time window.</li>
        <li><strong>Errors</strong> are surfaced both as monitor failures and as browser/runtime error events that do not always cause full outage.</li>
        <li><strong>Saturation</strong> is approximated through node health, cluster pressure, and monitor placement rather than full host APM metrics.</li>
      </ul>
      <h3>How To Troubleshoot</h3>
      <ol class="help-numbered-list">
        <li>Open the monitor dashboard and pick a relevant time range.</li>
        <li>Review the <strong>Alert Thresholds</strong> and <strong>Session Diagnostics</strong> panels near the top.</li>
        <li>Use the <strong>Failures</strong> tab for incident-focused sequences and failure cards.</li>
        <li>Open <strong>Run Diagnostics</strong> only for the sessions you want to inspect closely.</li>
        <li>For browser monitors, download the HAR-style export and review request-level behavior.</li>
      </ol>
      <div class="help-callout">
        <strong>Tip:</strong>
        <p>If a browser page loads but still feels broken, look at the error trend and the session diagnostics rather than only the high-level availability line.</p>
      </div>
    `,
  },
  {
    id: "cluster-and-containers",
    section: "operations",
    title: "Cluster and Container Operations",
    summary: "How monitoring nodes share work, expose status, and recover peers.",
    keywords: ["cluster", "containers", "configure containers", "nodes", "peers", "docker network", "ports"],
    content: () => `
      <h3>What The Cluster Page Is For</h3>
      <p>The <strong>Administration → Cluster And Containers</strong> area is where you inspect live monitoring containers, peer definitions, Docker networks, published host ports, and node health.</p>
      <h3>Container Scopes</h3>
      <ul class="help-bullet-list">
        <li><strong>Peer only</strong> means the node watches cluster peers but does not own endpoint monitors.</li>
        <li><strong>Full monitoring</strong> means the node can run endpoint and browser monitors as well as cluster checks.</li>
      </ul>
      <h3>Placement Guidance</h3>
      <p>When creating a monitor, use auto placement by default. Pin a monitor to a specific node only when you have a strong reason, such as network locality or a dedicated troubleshooting path.</p>
      <div class="help-callout">
        <strong>Important scope note:</strong>
        <p>Cluster And Containers is now an administration workflow. It no longer has its own primary left-navigation destination outside Administration.</p>
      </div>
    `,
  },
  {
    id: "administration-workspace",
    section: "administration",
    title: "Administration Workspace",
    summary: "Users, roles, profile settings, email, telemetry, scaling, and service configuration.",
    keywords: ["administration", "users", "roles", "read only", "read write", "admin", "service configuration"],
    content: () => `
      <h3>User Roles</h3>
      <div class="help-example-grid">
        <article class="help-example-card">
          <h4>Read Only</h4>
          <p>Can inspect health, dashboards, and monitor results, but cannot change monitor definitions or containers.</p>
        </article>
        <article class="help-example-card">
          <h4>Read Write</h4>
          <p>Can create and update monitors, but cannot perform full container or service-configuration administration.</p>
        </article>
        <article class="help-example-card">
          <h4>Administrator</h4>
          <p>Full access to users, telemetry, email, auth, scaling, container management, and other platform settings.</p>
        </article>
      </div>
      <h3>Service Configuration Areas</h3>
      <ul class="help-bullet-list">
        <li>Telemetry storage for PostgreSQL and MinIO or OCI object storage</li>
        <li>Email notification provider settings and optional local email service provisioning</li>
        <li>Portal authentication settings and OCI auth scaffolding</li>
        <li>UI scaling controls for Docker-based dashboard replicas and sticky/session-aware access</li>
        <li>Cluster And Containers controls for peer definitions, node status, container scope, and container lifecycle</li>
      </ul>
      <h3>Administration Page Layout</h3>
      <ul class="help-bullet-list">
        <li><strong>User Administration</strong> is for accounts, access levels, and profile-related governance.</li>
        <li><strong>Application Configuration</strong> is for telemetry, email, auth, scaling, and cloud integration settings.</li>
        <li><strong>Cluster And Containers</strong> is for monitoring-node configuration, live cluster status, and container management.</li>
      </ul>
    `,
  },
  {
    id: "telemetry-storage",
    section: "administration",
    title: "Telemetry Storage and Retention",
    summary: "How PostgreSQL, MinIO, OCI, retention, and self-provisioning fit together.",
    keywords: ["telemetry", "postgresql", "minio", "oci object storage", "retention", "provision local"],
    content: () => `
      <h3>Storage Design</h3>
      <p>Time-series monitor data is retained in PostgreSQL. Rich diagnostics, snapshots, and larger investigation payloads are retained in MinIO today and can move cleanly to OCI Object Storage later.</p>
      <h3>Retention</h3>
      <p>Retention hours control how much historical data remains available to dashboards and troubleshooting workflows. Lower retention reduces storage use and keeps the UI fast.</p>
      <h3>Self-Service Provisioning</h3>
      <p>If you choose local storage and ask the application to provision it for you, the app fills in the managed connection settings automatically and disables the fields it now owns.</p>
      <p>That same pattern now applies to local object storage provisioning as well, so operators do not have to manually wire PostgreSQL or MinIO connection details when they choose automatic local setup.</p>
      <div class="help-callout">
        <strong>Cloud-friendly design:</strong>
        <p>The PostgreSQL plus object-storage split makes it much easier to transition the entire data layer to OCI over time without redesigning the dashboard model.</p>
      </div>
    `,
  },
  {
    id: "deployment-modes",
    section: "deployment",
    title: "Deployment Overview",
    summary: "Understand the supported deployment paths before choosing local, Docker, Kubernetes, Helm, or offline.",
    keywords: ["docker", "offline", "local", "scaled ui", "deployment", "compose", "kubernetes", "helm"],
    content: () => `
      <h3>Supported Deployment Paths</h3>
      <div class="help-example-grid">
        <article class="help-example-card">
          <h4>Local Python</h4>
          <p>Best for development, feature work, and debugging on a workstation.</p>
        </article>
        <article class="help-example-card">
          <h4>Docker / Docker Desktop</h4>
          <p>Best for local runtime parity, single-node testing, and Docker-oriented container workflows.</p>
        </article>
        <article class="help-example-card">
          <h4>Kubernetes</h4>
          <p>Best for managed cloud deployment, higher operability, stronger platform controls, and cluster-native scaling.</p>
        </article>
        <article class="help-example-card">
          <h4>Offline</h4>
          <p>Best for air-gapped or disconnected environments after dependencies and images are pre-staged.</p>
        </article>
      </div>
      <h3>Local Development</h3>
      <pre class="mono">py -3 -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -e .
py -3 -m service_monitor --config config.yaml</pre>
      <h3>Docker Runtime</h3>
      <pre class="mono">docker build -t async-service-monitor .
docker run --rm -p 8000:8000 -v ${"${PWD}"}/config.yaml:/app/config.yaml async-service-monitor</pre>
      <h3>Kubernetes Runtime</h3>
      <p>The repo now supports both <strong>Kustomize overlays</strong> and a <strong>Helm chart</strong> for OKE, EKS, and AKS. Use Kubernetes when you want a managed control plane, cloud load balancers, ingress, TLS, autoscaling, and more mature day-two operations.</p>
      <h3>Scaled UI Mode</h3>
      <p>Enable UI scaling from Administration when you want dashboard-heavy read traffic served by separate dashboard containers behind the proxy.</p>
      <h3>Offline Mode</h3>
      <p>Prepare the wheelhouse, browser payloads, and Docker images on a connected machine first, then load them in the air-gapped environment using the provided scripts.</p>
      <h3>Recommended Reading Order</h3>
      <ol class="help-numbered-list">
        <li><a href="${guideTopicHref("deployment", "kubernetes-prerequisites")}" data-link>Kubernetes Prerequisites</a></li>
        <li><a href="${guideTopicHref("deployment", "publish-container-image")}" data-link>Publish The Container Image</a></li>
        <li><a href="${guideTopicHref("deployment", "kustomize-deployments")}" data-link>Deploy With Kustomize</a> or <a href="${guideTopicHref("deployment", "helm-deployments")}" data-link>Deploy With Helm</a></li>
        <li><a href="${guideTopicHref("deployment", "provider-specific-kubernetes")}" data-link>Review OKE, EKS, and AKS Notes</a></li>
        <li><a href="${guideTopicHref("deployment", "validate-kubernetes-deployment")}" data-link>Validate The Deployment</a></li>
      </ol>
    `,
  },
  {
    id: "kubernetes-prerequisites",
    section: "deployment",
    title: "Kubernetes Prerequisites",
    summary: "What you need in place before deploying to OKE, EKS, or AKS.",
    keywords: ["kubernetes", "prerequisites", "oke", "eks", "aks", "kubectl", "helm", "kustomize"],
    content: () => `
      <h3>Required Tools</h3>
      <ul class="help-bullet-list">
        <li><strong>kubectl</strong> configured for your target cluster</li>
        <li><strong>Docker</strong> or another container build tool</li>
        <li><strong>Kustomize</strong> if you want plain-manifest deployment</li>
        <li><strong>Helm</strong> if you want parameterized chart-based deployment</li>
      </ul>
      <h3>Cluster Requirements</h3>
      <ul class="help-bullet-list">
        <li>A reachable cluster in OKE, EKS, or AKS</li>
        <li>A registry the cluster can pull from</li>
        <li>Permissions to create namespaces, Deployments, Services, ConfigMaps, and optionally Ingress and HPA resources</li>
      </ul>
      <h3>Application Prerequisites</h3>
      <ul class="help-bullet-list">
        <li>Review <code>config.kubernetes.yaml</code> before the first deployment</li>
        <li>If you use encrypted config values, create the Kubernetes secret for <code>ASM_CONFIG_PASSPHRASE</code></li>
        <li>For the first deployment, keep the setup simple: minimal checks, telemetry off, and cluster mode off</li>
      </ul>
      <div class="help-callout">
        <strong>Recommended first production milestone:</strong>
        <p>Get the UI reachable and sign-in working first. Add managed telemetry and more complex monitor sets only after the base deployment is stable.</p>
      </div>
    `,
  },
  {
    id: "publish-container-image",
    section: "deployment",
    title: "Publish The Container Image",
    summary: "Build the image, tag it, and push it to a registry your cluster can pull from.",
    keywords: ["container image", "registry", "ecr", "acr", "ocir", "docker build", "docker push"],
    content: () => `
      <h3>Step 1: Build The Image</h3>
      <pre class="mono">docker build -t async-service-monitor:latest .</pre>
      <h3>Step 2: Tag For Your Registry</h3>
      <pre class="mono">docker tag async-service-monitor:latest &lt;registry&gt;/async-service-monitor:&lt;tag&gt;</pre>
      <h3>Step 3: Push</h3>
      <pre class="mono">docker push &lt;registry&gt;/async-service-monitor:&lt;tag&gt;</pre>
      <h3>Typical Registry Choices</h3>
      <ul class="help-bullet-list">
        <li><strong>OKE</strong>: OCIR</li>
        <li><strong>EKS</strong>: ECR</li>
        <li><strong>AKS</strong>: ACR</li>
      </ul>
      <h3>Important Note</h3>
      <p>Your Kubernetes deployment files reference the image name only. You must update the Kustomize overlay or Helm values to point at the registry image your cluster can actually pull.</p>
    `,
  },
  {
    id: "kustomize-deployments",
    section: "deployment",
    title: "Deploy With Kustomize",
    summary: "Use the provider overlays to deploy plain Kubernetes manifests to OKE, EKS, or AKS.",
    keywords: ["kustomize", "kubectl apply -k", "overlays", "oke", "eks", "aks"],
    content: () => `
      <h3>What Kustomize Is Best For</h3>
      <p>Use Kustomize when you want plain YAML in the repo and a small, reviewable overlay per cloud provider.</p>
      <h3>Step 1: Review The Base Layout</h3>
      <ul class="help-bullet-list">
        <li><code>kubernetes/base</code> contains the shared Deployment, Service, PodDisruptionBudget, and ConfigMap wiring</li>
        <li><code>kubernetes/overlays/oke</code>, <code>eks</code>, and <code>aks</code> add provider-specific load balancer behavior</li>
      </ul>
      <h3>Step 2: Set The Image</h3>
      <pre class="mono">cd kubernetes\\overlays\\eks
kustomize edit set image async-service-monitor=&lt;registry&gt;/async-service-monitor:&lt;tag&gt;</pre>
      <h3>Step 3: Apply The Overlay</h3>
      <pre class="mono">kubectl apply -k kubernetes\\overlays\\eks</pre>
      <h3>When To Use It</h3>
      <p>Kustomize is a great fit when your deployment model is mostly static and your platform team prefers checked-in YAML instead of runtime chart values.</p>
    `,
  },
  {
    id: "helm-deployments",
    section: "deployment",
    title: "Deploy With Helm",
    summary: "Use the Helm chart when you want values-driven installs, ingress, TLS, or HPA options.",
    keywords: ["helm", "chart", "ingress", "tls", "autoscaling", "hpa"],
    content: () => `
      <h3>What Helm Is Best For</h3>
      <p>Use Helm when you want environment-specific values, smoother promotion across stages, optional ingress and TLS, or easy HPA toggles.</p>
      <h3>Basic Install</h3>
      <pre class="mono">helm upgrade --install async-service-monitor .\\helm\\async-service-monitor ^
  --namespace async-service-monitor ^
  --create-namespace ^
  --set image.repository=&lt;registry&gt;/async-service-monitor ^
  --set image.tag=&lt;tag&gt;</pre>
      <h3>Provider Presets</h3>
      <ul class="help-bullet-list">
        <li><code>values-oke.yaml</code></li>
        <li><code>values-eks.yaml</code></li>
        <li><code>values-aks.yaml</code></li>
      </ul>
      <h3>Ingress And TLS</h3>
      <p>The chart can also switch to <code>ClusterIP</code> plus ingress and attach TLS hosts and secrets without maintaining a second set of manifests.</p>
      <h3>Autoscaling</h3>
      <p>The chart includes an optional Horizontal Pod Autoscaler for higher-traffic UI/API scenarios.</p>
    `,
  },
  {
    id: "provider-specific-kubernetes",
    section: "deployment",
    title: "OKE, EKS, and AKS Notes",
    summary: "What changes per cloud provider and what to validate after deployment.",
    keywords: ["oke", "eks", "aks", "load balancer", "health probe", "nlb", "oci", "azure"],
    content: () => `
      <h3>OKE</h3>
      <p>The OKE overlay and values preset use a public OCI load balancer with a flexible shape. In some environments you may still need to add subnet-related annotations depending on your tenancy networking model.</p>
      <h3>EKS</h3>
      <p>The EKS overlay and values preset use a public Network Load Balancer and point the load balancer health check at <code>/healthz</code>. You may still need to adapt internet-facing versus internal behavior and any security group expectations.</p>
      <h3>AKS</h3>
      <p>The AKS overlay and values preset use an Azure load balancer and set the Azure health probe request path to <code>/healthz</code>. You may still need to adapt public versus internal exposure or static IP requirements.</p>
      <h3>Common Validation Steps</h3>
      <ul class="help-bullet-list">
        <li>Check the pod state with <code>kubectl get pods -n async-service-monitor</code></li>
        <li>Check the service with <code>kubectl get svc -n async-service-monitor</code></li>
        <li>Describe the service if the external address does not appear as expected</li>
        <li>Use <code>kubectl port-forward</code> during early validation if the load balancer path is not ready yet</li>
      </ul>
    `,
  },
  {
    id: "validate-kubernetes-deployment",
    section: "deployment",
    title: "Validate And Operate The Deployment",
    summary: "How to confirm the app is healthy in-cluster and what to configure next.",
    keywords: ["validate", "deployment", "port-forward", "probes", "readiness", "healthz", "operate"],
    content: () => `
      <h3>Validation Order</h3>
      <ol class="help-numbered-list">
        <li>Confirm the pod is running</li>
        <li>Confirm the service exists</li>
        <li>Confirm Kubernetes probes are passing</li>
        <li>Confirm the portal is reachable</li>
        <li>Sign in and verify the UI loads correctly</li>
      </ol>
      <h3>Useful Commands</h3>
      <pre class="mono">kubectl get pods -n async-service-monitor
kubectl get svc -n async-service-monitor
kubectl describe pod -n async-service-monitor &lt;pod-name&gt;
kubectl port-forward -n async-service-monitor svc/async-service-monitor 8000:80</pre>
      <h3>After The First Successful Login</h3>
      <ul class="help-bullet-list">
        <li>Configure telemetry storage</li>
        <li>Point the app at managed PostgreSQL and object storage if desired</li>
        <li>Create or import your first monitors</li>
        <li>Only then consider more advanced scaling, ingress, and storage adjustments</li>
      </ul>
      <div class="help-callout">
        <strong>Kubernetes operating model:</strong>
        <p>The app can run in Kubernetes cleanly, but the in-app Docker container lifecycle tools remain Docker-focused. For Kubernetes, treat Deployments, Services, ingress, and HPA as the primary operational controls.</p>
      </div>
    `,
  },
  {
    id: "third-party-libraries",
    section: "libraries",
    title: "Third-Party Libraries",
    summary: "Runtime and optional libraries used to build, operate, and visualize the platform.",
    keywords: ["libraries", "dependencies", "licenses", "versions", "third party", "plotly", "fastapi", "playwright"],
    content: () => `
      <h3>What This Covers</h3>
      <p>This topic documents the main third-party libraries used by the application runtime, browser monitoring stack, Docker integration layer, and the optional help-diagram toolchain.</p>
      <div class="help-callout">
        <strong>Version note:</strong>
        <p><strong>Declared Version</strong> comes from the project dependency definition. <strong>Observed Version</strong> reflects what is installed in this current desktop environment, which may differ if an optional dependency is not installed here yet.</p>
      </div>
      ${thirdPartyLibrariesMarkup()}
      <h3>License Guidance</h3>
      <p>Some packages expose a clean SPDX-style license in metadata, while others only expose classifiers or project pages. For entries that say <strong>See runtime package metadata when installed</strong> or <strong>Project metadata does not expose a simple SPDX string in this environment</strong>, the package is either optional here or its installed metadata is not normalized into a short license field.</p>
      <h3>Why This Matters</h3>
      <ul class="help-bullet-list">
        <li>Offline deployments need the runtime dependencies and any vendored frontend assets prepared ahead of time.</li>
        <li>Cloud or regulated environments often need software-bill-of-materials style visibility before deployment.</li>
        <li>Browser monitoring depends on both the Playwright Python library and the browser runtime payloads that are staged separately for offline use.</li>
      </ul>
    `,
  },
];

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

function monitorKey(checkOrResult) {
  return checkOrResult?.id || checkOrResult?.check_id || checkOrResult?.name || "";
}

function monitorPoints(check, checkMetrics = {}) {
  return checkMetrics[check?.id] || checkMetrics[check?.name] || [];
}

function monitorResultMatches(check, result) {
  if (!check || !result) return false;
  const checkId = check.id || null;
  const resultId = result.check_id || result.id || null;
  if (checkId && resultId && checkId === resultId) return true;
  return Boolean(check.name && result.name && check.name === result.name);
}

function monitorResults(check, recentResults = []) {
  return (Array.isArray(recentResults) ? recentResults : []).filter((result) => monitorResultMatches(check, result));
}

function averageDuration(points = []) {
  if (!Array.isArray(points) || !points.length) return null;
  return points.reduce((sum, point) => sum + Number(point.duration_ms || 0), 0) / points.length;
}

function percentileDuration(points = [], percentile = 95) {
  if (!Array.isArray(points) || !points.length) return null;
  const values = points
    .map((point) => Number(point.duration_ms || 0))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil((percentile / 100) * values.length) - 1));
  return values[index];
}

function availabilityPercent(points = []) {
  if (!Array.isArray(points) || !points.length) return null;
  const healthy = points.filter((point) => point.healthy).length;
  return (healthy / points.length) * 100;
}

function errorRatePercent(points = []) {
  if (!Array.isArray(points) || !points.length) return null;
  const unhealthy = points.filter((point) => !point.healthy).length;
  return (unhealthy / points.length) * 100;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `${Number(value).toFixed(1)}%`;
}

function plotlyHostMarkup(kind, payload, fallbackMarkup, className = "") {
  return `
    <div class="plotly-chart-host ${className}" data-plotly-kind="${escapeHtml(kind)}" data-plotly-payload="${escapeHtml(encodeURIComponent(JSON.stringify(payload)))}">
      ${fallbackMarkup}
    </div>
  `;
}

function defaultAlertThresholds() {
  return {
    mode: "auto",
    availability_warning: 99.5,
    availability_critical: 99.0,
    error_rate_warning: 2.0,
    error_rate_critical: 5.0,
    p95_latency_warning_ms: 1500.0,
    p95_latency_critical_ms: 3000.0,
    p99_latency_warning_ms: 2500.0,
    p99_latency_critical_ms: 5000.0,
  };
}

function learnedAlertThresholds(points = []) {
  const defaults = defaultAlertThresholds();
  if (!Array.isArray(points) || !points.length) return defaults;
  const availability = availabilityPercent(points);
  const errorRate = errorRatePercent(points);
  const p95Latency = percentileDuration(points, 95);
  const p99Latency = percentileDuration(points, 99);
  return {
    mode: "auto",
    availability_warning: Math.max(95, Math.min(99.9, Number(availability ?? defaults.availability_warning) - 0.3)),
    availability_critical: Math.max(90, Math.min(99.5, Number(availability ?? defaults.availability_critical) - 0.8)),
    error_rate_warning: Math.max(defaults.error_rate_warning, Number(errorRate ?? 0) * 1.5),
    error_rate_critical: Math.max(defaults.error_rate_critical, Number(errorRate ?? 0) * 2.5),
    p95_latency_warning_ms: Math.max(defaults.p95_latency_warning_ms, Number(p95Latency ?? 0) * 1.25),
    p95_latency_critical_ms: Math.max(defaults.p95_latency_critical_ms, Number(p95Latency ?? 0) * 1.75),
    p99_latency_warning_ms: Math.max(defaults.p99_latency_warning_ms, Number(p99Latency ?? 0) * 1.25),
    p99_latency_critical_ms: Math.max(defaults.p99_latency_critical_ms, Number(p99Latency ?? 0) * 1.75),
  };
}

function effectiveAlertThresholds(check, points = []) {
  const configured = { ...defaultAlertThresholds(), ...(check?.alert_thresholds || {}) };
  if (configured.mode === "manual") {
    return configured;
  }
  return learnedAlertThresholds(points);
}

function runDiagnosticKey(check, result) {
  return `${monitorKey(check)}::${Number(result?.timestamp || 0)}`;
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function browserResultToHar(check, result) {
  const network = Array.isArray(result?.details?.network) ? result.details.network : [];
  const pageUrl = result?.details?.final_url || check?.url || "";
  const startedAt = Number(result?.timestamp || 0) - (Number(result?.duration_ms || 0) / 1000);
  return {
    log: {
      version: "1.2",
      creator: {
        name: "Service Health Portal",
        version: "1.0",
      },
      browser: {
        name: "Chromium",
        version: "Playwright",
      },
      pages: [
        {
          startedDateTime: new Date(startedAt * 1000).toISOString(),
          id: "page_1",
          title: result?.details?.title || check?.name || "Browser Monitor",
          pageTimings: {
            onContentLoad: Number(result?.details?.performance?.domContentLoadedMs ?? -1),
            onLoad: Number(result?.details?.performance?.loadMs ?? -1),
          },
        },
      ],
      entries: network.map((entry, index) => {
        const startedDateTime = new Date(Number(entry.started_at || startedAt) * 1000).toISOString();
        const totalTime = Number(entry.duration_ms || 0);
        return {
          pageref: "page_1",
          startedDateTime,
          time: totalTime,
          request: {
            method: entry.method || "GET",
            url: entry.url || pageUrl,
            httpVersion: "HTTP/1.1",
            headers: [],
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: -1,
          },
          response: {
            status: entry.status ?? 0,
            statusText: entry.failure || "",
            httpVersion: "HTTP/1.1",
            headers: [],
            cookies: [],
            content: {
              size: -1,
              mimeType: entry.resource_type || "application/octet-stream",
              text: entry.failure || "",
            },
            redirectURL: "",
            headersSize: -1,
            bodySize: -1,
          },
          cache: {},
          timings: {
            blocked: 0,
            dns: -1,
            connect: -1,
            send: 0,
            wait: totalTime,
            receive: 0,
            ssl: -1,
          },
          _serviceHealthPortal: {
            ok: entry.ok,
            failure: entry.failure || null,
            resourceType: entry.resource_type || null,
            index,
          },
        };
      }),
    },
  };
}

function sparklineSvgMarkup(points, variant = "good") {
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

function sparklineMarkup(points, variant = "good") {
  return plotlyHostMarkup("sparkline", { points, variant }, sparklineSvgMarkup(points, variant), "plotly-sparkline");
}

function historyChartSvgMarkup(points, variant = "good", width = 720, height = 180) {
  const normalized = Array.isArray(points) && points.length
    ? points.map((point) => ({
        timestamp: Number(point.timestamp || 0),
        healthy: point.healthy ? 1 : 0,
        duration: Number(point.duration_ms || 0),
      }))
    : [{ timestamp: 0, healthy: 0, duration: 0 }];
  const minTime = Math.min(...normalized.map((point) => point.timestamp));
  const maxTime = Math.max(...normalized.map((point) => point.timestamp));
  const maxDuration = Math.max(...normalized.map((point) => point.duration), 1);
  const plotWidth = width - 24;
  const plotHeight = height - 28;
  const baseX = 12;
  const baseY = 8;
  const coords = normalized.map((point, index) => {
    const x = normalized.length === 1
      ? baseX + plotWidth / 2
      : baseX + (((point.timestamp - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth);
    const y = baseY + ((1 - point.healthy) * plotHeight);
    const durationY = baseY + plotHeight - ((point.duration / maxDuration) * plotHeight);
    return { x, y, durationY, healthy: point.healthy };
  });
  const availabilityLine = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const durationLine = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.durationY.toFixed(1)}`).join(" ");
  return `
    <svg class="history-chart ${variant}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="12" y1="${height - 20}" x2="${width - 12}" y2="${height - 20}" class="axis"></line>
      <line x1="12" y1="8" x2="12" y2="${height - 20}" class="axis"></line>
      <path class="availability-line" d="${availabilityLine}"></path>
      <path class="duration-line" d="${durationLine}"></path>
      ${coords.map((point, index) => {
        const source = normalized[index];
        const title = `${point.healthy ? "Healthy" : "Unhealthy"} run | ${fmtTime(source.timestamp)} | ${formatDuration(source.duration)}`;
        return `
          <g>
            <title>${escapeHtml(title)}</title>
            <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="availability-dot ${point.healthy ? "healthy" : "unhealthy"}"></circle>
            <circle cx="${point.x.toFixed(1)}" cy="${point.durationY.toFixed(1)}" r="3.5" class="duration-dot"></circle>
          </g>
        `;
      }).join("")}
    </svg>
  `;
}

function historyChartMarkup(points, variant = "good", width = 720, height = 180) {
  return plotlyHostMarkup("history", { points, variant, width, height }, historyChartSvgMarkup(points, variant, width, height), "plotly-history");
}

function outcomeBarsSvgMarkup(points, width = 720, height = 96) {
  const normalized = Array.isArray(points) && points.length
    ? points.map((point) => ({
        timestamp: Number(point.timestamp || 0),
        healthy: Boolean(point.healthy),
        duration: Number(point.duration_ms || 0),
      }))
    : [];
  if (!normalized.length) {
    return `
      <div class="empty-chart-state">
        <p>No monitor output has been captured yet.</p>
      </div>
    `;
  }
  const maxDuration = Math.max(...normalized.map((point) => point.duration), 1);
  const barGap = 4;
  const chartWidth = width - 20;
  const barWidth = Math.max(8, (chartWidth - (barGap * (normalized.length - 1))) / normalized.length);
  return `
    <svg class="outcome-bars-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="10" y1="${height - 14}" x2="${width - 10}" y2="${height - 14}" class="axis"></line>
      ${normalized.map((point, index) => {
        const x = 10 + index * (barWidth + barGap);
        const barHeight = Math.max(10, ((point.duration || 1) / maxDuration) * (height - 28));
        const y = height - 14 - barHeight;
        const cls = point.healthy ? "healthy" : "unhealthy";
        const title = `${point.healthy ? "Healthy" : "Unhealthy"} run | ${fmtTime(point.timestamp)} | ${formatDuration(point.duration)}`;
        return `
          <g>
            <title>${escapeHtml(title)}</title>
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" class="outcome-bar ${cls}"></rect>
          </g>
        `;
      }).join("")}
    </svg>
  `;
}

function outcomeBarsMarkup(points, width = 720, height = 96) {
  return plotlyHostMarkup("bars", { points, width, height }, outcomeBarsSvgMarkup(points, width, height), "plotly-bars");
}

function latencyLineSvgMarkup(points, width = 720, height = 180) {
  const normalized = Array.isArray(points) && points.length
    ? points.map((point) => ({
        timestamp: Number(point.timestamp || 0),
        healthy: Boolean(point.healthy),
        duration: Number(point.duration_ms || 0),
      }))
    : [];
  if (!normalized.length) {
    return `
      <div class="empty-chart-state latency-empty-state">
        <p>No latency samples have been captured yet.</p>
      </div>
    `;
  }
  const minTime = Math.min(...normalized.map((point) => point.timestamp));
  const maxTime = Math.max(...normalized.map((point) => point.timestamp));
  const maxDuration = Math.max(...normalized.map((point) => point.duration), 1);
  const plotWidth = width - 24;
  const plotHeight = height - 28;
  const baseX = 12;
  const baseY = 8;
  const coords = normalized.map((point) => {
    const x = normalized.length === 1
      ? baseX + plotWidth / 2
      : baseX + (((point.timestamp - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth);
    const y = baseY + plotHeight - ((point.duration / maxDuration) * plotHeight);
    return { x, y, healthy: point.healthy, duration: point.duration, timestamp: point.timestamp };
  });
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${height - 20} L ${coords[0].x.toFixed(1)} ${height - 20} Z`;
  return `
    <svg class="latency-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="12" y1="${height - 20}" x2="${width - 12}" y2="${height - 20}" class="axis"></line>
      <line x1="12" y1="8" x2="12" y2="${height - 20}" class="axis"></line>
      <path class="latency-area" d="${area}"></path>
      <path class="latency-line" d="${line}"></path>
      ${coords.map((point) => {
        const title = `${point.healthy ? "Healthy" : "Unhealthy"} run | ${fmtTime(point.timestamp)} | ${formatDuration(point.duration)}`;
        return `
          <g>
            <title>${escapeHtml(title)}</title>
            <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="latency-dot ${point.healthy ? "healthy" : "unhealthy"}"></circle>
          </g>
        `;
      }).join("")}
    </svg>
  `;
}

function latencyLineChartMarkup(points, width = 720, height = 180) {
  return plotlyHostMarkup("latency", { points, width, height }, latencyLineSvgMarkup(points, width, height), "plotly-latency");
}

function resultErrorCount(result) {
  if (!result) return 0;
  const details = result.details || {};
  if (result.check_type === "browser") {
    const pageErrors = Array.isArray(details.page_errors) ? details.page_errors.length : 0;
    const consoleErrors = Array.isArray(details.console)
      ? details.console.filter((entry) => String(entry?.type || "").toLowerCase() === "error").length
      : 0;
    const failedRequests = Array.isArray(details.network)
      ? details.network.filter((entry) => entry.failure || entry.ok === false).length
      : 0;
    const failedSteps = Array.isArray(details.steps)
      ? details.steps.filter((step) => step.success === false).length
      : 0;
    const total = pageErrors + consoleErrors + failedRequests + failedSteps;
    return total || (result.success ? 0 : 1);
  }
  const statusCode = Number(details.status_code || details.authenticated_status || 0);
  if (!result.success) {
    return statusCode >= 400 ? 1 : 1;
  }
  return statusCode >= 400 ? 1 : 0;
}

function errorTrendPoints(results = []) {
  return (Array.isArray(results) ? results : []).map((result) => ({
    timestamp: Number(result.timestamp || 0),
    error_count: resultErrorCount(result),
    success: Boolean(result.success),
    duration_ms: Number(result.duration_ms || 0),
  }));
}

function errorTrendSvgMarkup(points, width = 720, height = 180) {
  const normalized = Array.isArray(points) && points.length
    ? points
    : [];
  if (!normalized.length) {
    return `
      <div class="empty-chart-state latency-empty-state">
        <p>No error samples have been captured yet.</p>
      </div>
    `;
  }
  const minTime = Math.min(...normalized.map((point) => point.timestamp));
  const maxTime = Math.max(...normalized.map((point) => point.timestamp));
  const maxErrors = Math.max(...normalized.map((point) => Number(point.error_count || 0)), 1);
  const plotWidth = width - 24;
  const plotHeight = height - 28;
  const baseX = 12;
  const baseY = 8;
  const coords = normalized.map((point) => {
    const x = normalized.length === 1
      ? baseX + plotWidth / 2
      : baseX + (((point.timestamp - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth);
    const y = baseY + plotHeight - ((Number(point.error_count || 0) / maxErrors) * plotHeight);
    return { x, y, errorCount: Number(point.error_count || 0), timestamp: point.timestamp };
  });
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${height - 20} L ${coords[0].x.toFixed(1)} ${height - 20} Z`;
  return `
    <svg class="error-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="12" y1="${height - 20}" x2="${width - 12}" y2="${height - 20}" class="axis"></line>
      <line x1="12" y1="8" x2="12" y2="${height - 20}" class="axis"></line>
      <path class="error-area" d="${area}"></path>
      <path class="error-line" d="${line}"></path>
      ${coords.map((point) => `
        <g>
          <title>${escapeHtml(`${fmtTime(point.timestamp)} | ${point.errorCount} error events`)}</title>
          <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="error-dot"></circle>
        </g>
      `).join("")}
    </svg>
  `;
}

function errorTrendChartMarkup(points, width = 720, height = 180) {
  return plotlyHostMarkup("errors", { points, width, height }, errorTrendSvgMarkup(points, width, height), "plotly-errors");
}

function plotlyPalette() {
  const dark = document.body.dataset.theme === "dark";
  return {
    paper: dark ? "#111827" : "#ffffff",
    plot: dark ? "#111827" : "#ffffff",
    text: dark ? "#e5e7eb" : "#1f2937",
    muted: dark ? "#94a3b8" : "#6b7280",
    line: dark ? "rgba(148,163,184,0.25)" : "rgba(107,114,128,0.2)",
    green: "#0f766e",
    red: "#b42318",
    amber: "#b57a00",
  };
}

function hydratePlotlyCharts(root = document) {
  if (!window.Plotly) {
    return;
  }
  const palette = plotlyPalette();
  root.querySelectorAll(".plotly-chart-host").forEach((host) => {
    const encoded = host.dataset.plotlyPayload;
    const kind = host.dataset.plotlyKind;
    if (!encoded || !kind) return;
    let payload;
    try {
      payload = JSON.parse(decodeURIComponent(encoded));
    } catch {
      return;
    }
    const points = Array.isArray(payload.points) ? payload.points : [];
    const config = { displayModeBar: false, responsive: true };
    let traces = [];
    let layout = {
      paper_bgcolor: palette.paper,
      plot_bgcolor: palette.plot,
      margin: { l: 22, r: 12, t: 8, b: 18 },
      font: { color: palette.text, size: 11 },
    };

    if (kind === "sparkline") {
      traces = [{
        x: points.map((_, index) => index + 1),
        y: points.length ? points.map((point) => (point.healthy ? 1 : 0)) : [0],
        type: "scatter",
        mode: "lines+markers",
        line: { color: payload.variant === "bad" ? palette.red : payload.variant === "neutral" ? palette.muted : palette.green, width: 2 },
        marker: { size: 4 },
        fill: "tozeroy",
        fillcolor: payload.variant === "bad" ? "rgba(180,35,24,0.12)" : payload.variant === "neutral" ? "rgba(107,114,128,0.12)" : "rgba(15,118,110,0.12)",
        hovertemplate: "Run %{x}<br>Healthy: %{y}<extra></extra>",
      }];
      layout = {
        ...layout,
        height: 44,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        xaxis: { visible: false, fixedrange: true },
        yaxis: { visible: false, fixedrange: true, range: [-0.1, 1.1] },
      };
    } else if (kind === "history") {
      traces = [
        {
          x: points.map((point) => new Date(Number(point.timestamp || 0) * 1000)),
          y: points.map((point) => (point.healthy ? 1 : 0)),
          type: "scatter",
          mode: "lines+markers",
          name: "Availability",
          line: { color: payload.variant === "bad" ? palette.red : payload.variant === "neutral" ? palette.muted : palette.green, width: 3 },
          marker: { size: 7, color: points.map((point) => point.healthy ? palette.green : palette.red) },
          hovertemplate: "%{x}<br>Healthy: %{y}<extra></extra>",
        },
        {
          x: points.map((point) => new Date(Number(point.timestamp || 0) * 1000)),
          y: points.map((point) => Number(point.duration_ms || 0)),
          type: "scatter",
          mode: "lines",
          name: "Latency (ms)",
          yaxis: "y2",
          line: { color: "rgba(59,130,246,0.75)", width: 2, dash: "dot" },
          hovertemplate: "%{x}<br>Latency %{y:.0f} ms<extra></extra>",
        },
      ];
      layout = {
        ...layout,
        height: payload.height || 180,
        legend: { orientation: "h", x: 0, y: 1.15, font: { color: palette.muted, size: 10 } },
        xaxis: { gridcolor: palette.line, color: palette.muted },
        yaxis: { range: [-0.1, 1.1], tickvals: [0, 1], ticktext: ["Down", "Up"], gridcolor: palette.line, color: palette.muted, fixedrange: true },
        yaxis2: { overlaying: "y", side: "right", showgrid: false, color: palette.muted, fixedrange: true },
      };
    } else if (kind === "bars") {
      traces = [{
        x: points.map((point) => new Date(Number(point.timestamp || 0) * 1000)),
        y: points.map((point) => Number(point.duration_ms || 0)),
        type: "bar",
        marker: { color: points.map((point) => point.healthy ? "rgba(15,118,110,0.78)" : "rgba(180,35,24,0.82)") },
        hovertemplate: "%{x}<br>Latency %{y:.0f} ms<extra></extra>",
      }];
      layout = {
        ...layout,
        height: payload.height || 96,
        xaxis: { gridcolor: palette.line, color: palette.muted },
        yaxis: { gridcolor: palette.line, color: palette.muted, title: { text: "ms", font: { color: palette.muted, size: 10 } } },
      };
    } else if (kind === "latency") {
      traces = [{
        x: points.map((point) => new Date(Number(point.timestamp || 0) * 1000)),
        y: points.map((point) => Number(point.duration_ms || 0)),
        type: "scatter",
        mode: "lines+markers",
        line: { color: "#2563eb", width: 3 },
        marker: { size: 7, color: points.map((point) => point.healthy ? palette.green : palette.red) },
        fill: "tozeroy",
        fillcolor: "rgba(37,99,235,0.10)",
        hovertemplate: "%{x}<br>Latency %{y:.0f} ms<extra></extra>",
      }];
      layout = {
        ...layout,
        height: payload.height || 180,
        xaxis: { gridcolor: palette.line, color: palette.muted },
        yaxis: { gridcolor: palette.line, color: palette.muted, title: { text: "Latency (ms)", font: { color: palette.muted, size: 10 } } },
      };
    } else if (kind === "errors") {
      traces = [{
        x: points.map((point) => new Date(Number(point.timestamp || 0) * 1000)),
        y: points.map((point) => Number(point.error_count || 0)),
        type: "scatter",
        mode: "lines+markers",
        line: { color: palette.red, width: 3 },
        marker: { size: 7, color: palette.red },
        fill: "tozeroy",
        fillcolor: "rgba(180,35,24,0.10)",
        hovertemplate: "%{x}<br>Error Events %{y:.0f}<extra></extra>",
      }];
      layout = {
        ...layout,
        height: payload.height || 180,
        xaxis: { gridcolor: palette.line, color: palette.muted },
        yaxis: { gridcolor: palette.line, color: palette.muted, title: { text: "Errors", font: { color: palette.muted, size: 10 } } },
      };
    } else {
      return;
    }

    host.innerHTML = "";
    window.Plotly.react(host, traces, layout, config);
  });
}

function sloBudgetMarkup(points, targetAvailability = 99.0) {
  const availability = availabilityPercent(points);
  const errorRate = errorRatePercent(points);
  if (availability == null) {
    return `
      <div class="guide-card slo-panel">
        <h4>SLO And Error Budget</h4>
        <p>No telemetry is available yet to calculate an error budget.</p>
      </div>
    `;
  }
  const allowedErrorRate = Math.max(0, 100 - targetAvailability);
  const budgetRemaining = allowedErrorRate <= 0
    ? 0
    : Math.max(0, ((allowedErrorRate - (errorRate || 0)) / allowedErrorRate) * 100);
  const budgetConsumed = 100 - budgetRemaining;
  const burnRate = allowedErrorRate <= 0 ? 0 : (errorRate || 0) / allowedErrorRate;
  const stateLabel = availability >= targetAvailability
    ? "Within SLO"
    : budgetRemaining > 0
      ? "Budget At Risk"
      : "Budget Exhausted";
  const stateClass = availability >= targetAvailability ? "healthy" : budgetRemaining > 0 ? "warning" : "unhealthy";
  return `
    <section class="guide-card slo-panel ${stateClass}">
      <div class="mini-panel-header">
        <h4>SLO And Error Budget</h4>
        <span>${stateLabel}</span>
      </div>
      <div class="slo-meter">
        <div class="slo-meter-fill ${stateClass}" style="width: ${Math.max(0, Math.min(100, budgetRemaining)).toFixed(1)}%;"></div>
      </div>
      <div class="dashboard-card-stats slo-stats">
        <div class="compact-card"><h4>SLO Target</h4><p>${formatPercent(targetAvailability)}</p></div>
        <div class="compact-card"><h4>Error Budget Left</h4><p>${formatPercent(budgetRemaining)}</p></div>
        <div class="compact-card"><h4>Budget Used</h4><p>${formatPercent(budgetConsumed)}</p></div>
        <div class="compact-card"><h4>Burn Rate</h4><p>${burnRate.toFixed(2)}x</p></div>
      </div>
    </section>
  `;
}

function thresholdStatus(value, warningThreshold, criticalThreshold, invert = false) {
  if (value == null) return "neutral";
  if (invert) {
    if (value <= criticalThreshold) return "unhealthy";
    if (value <= warningThreshold) return "warning";
    return "healthy";
  }
  if (value >= criticalThreshold) return "unhealthy";
  if (value >= warningThreshold) return "warning";
  return "healthy";
}

function alertThresholdsMarkup(check, points) {
  const thresholdConfig = effectiveAlertThresholds(check, points);
  const availability = availabilityPercent(points);
  const errorRate = errorRatePercent(points);
  const p95Latency = percentileDuration(points, 95);
  const p99Latency = percentileDuration(points, 99);
  const thresholdRows = [
    ["Availability", formatPercent(availability), thresholdStatus(availability, thresholdConfig.availability_warning, thresholdConfig.availability_critical, true), `Warn below ${formatPercent(thresholdConfig.availability_warning)}, critical below ${formatPercent(thresholdConfig.availability_critical)}`],
    ["Error Rate", formatPercent(errorRate), thresholdStatus(errorRate, thresholdConfig.error_rate_warning, thresholdConfig.error_rate_critical), `Warn above ${formatPercent(thresholdConfig.error_rate_warning)}, critical above ${formatPercent(thresholdConfig.error_rate_critical)}`],
    ["P95 Latency", formatDuration(p95Latency), thresholdStatus(p95Latency, thresholdConfig.p95_latency_warning_ms, thresholdConfig.p95_latency_critical_ms), `Warn above ${formatDuration(thresholdConfig.p95_latency_warning_ms)}, critical above ${formatDuration(thresholdConfig.p95_latency_critical_ms)}`],
    ["P99 Latency", formatDuration(p99Latency), thresholdStatus(p99Latency, thresholdConfig.p99_latency_warning_ms, thresholdConfig.p99_latency_critical_ms), `Warn above ${formatDuration(thresholdConfig.p99_latency_warning_ms)}, critical above ${formatDuration(thresholdConfig.p99_latency_critical_ms)}`],
  ];
  return `
    <section class="panel dashboard-subpanel">
      <div class="panel-head">
        <h3>Alert Thresholds</h3>
        <p>${thresholdConfig.mode === "manual" ? "Using manual thresholds configured on this monitor." : "Using adaptive thresholds learned from recent monitor behavior."}</p>
      </div>
      <div class="stack">
        ${thresholdRows.map(([label, value, status, description]) => `
          <div class="status-row compact threshold-row ${status}">
            <span class="dot ${status === "warning" ? "unhealthy" : status === "neutral" ? "disabled" : status}"></span>
            <div>
              <strong>${escapeHtml(label)}</strong>
              <div class="status-meta">
                <span>${escapeHtml(description)}</span>
              </div>
            </div>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function incidentTimelineMarkup(failures = []) {
  if (!failures.length) {
    return `<div class="guide-card"><h4>Incident Timeline</h4><p>No failed monitor sessions have been recorded for this monitor.</p></div>`;
  }
  const sorted = [...failures].sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0));
  const first = Number(sorted[0].timestamp || 0);
  const last = Number(sorted[sorted.length - 1].timestamp || 0);
  return `
    <div class="incident-timeline">
      ${sorted.map((failure) => {
        const ratio = first === last ? 0 : ((Number(failure.timestamp || 0) - first) / (last - first)) * 100;
        return `
          <article class="incident-card">
            <div class="incident-marker" style="left: ${ratio.toFixed(2)}%;"></div>
            <h4>${escapeHtml(failure.message || "Failure recorded")}</h4>
            <div class="status-meta">
              <span>${fmtTime(failure.timestamp)}</span>
              <span>${formatDuration(failure.duration_ms)}</span>
              <span>${escapeHtml(failure.owner || "monitor-1")}</span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function endpointSparkline(check, checkMetrics) {
  const points = monitorPoints(check, checkMetrics);
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
    api: "API",
    dns: "DNS",
    auth: "Auth",
    generic: "Generic",
    database: "Database",
    browser: "Browser",
  };
  return labels[type] || String(type || "Other").toUpperCase();
}

function dashboardVariant(check) {
  return check.status === "unhealthy" ? "bad" : check.status === "disabled" ? "neutral" : "good";
}

function dashboardMonitorMatches(check) {
  const query = state.dashboardWorkspace.query.trim().toLowerCase();
  const statusFilter = state.dashboardWorkspace.status;
  const typeFilter = state.dashboardWorkspace.type;
  const target = checkTargetLabel(check).toLowerCase();
  const typeLabel = checkCategoryLabel(check.type).toLowerCase();
  const matchesQuery = !query
    || check.name.toLowerCase().includes(query)
    || target.includes(query)
    || typeLabel.includes(query);
  const matchesStatus = statusFilter === "all" || check.status === statusFilter;
  const matchesType = typeFilter === "all" || check.type === typeFilter;
  return matchesQuery && matchesStatus && matchesType;
}

function monitorCardMarkup(check, checkMetrics) {
  const points = monitorPoints(check, checkMetrics);
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
      const href = link.getAttribute("href");
      const isMonitorsLink =
        href === "/monitors" &&
        (currentPath === "/monitors" ||
          currentPath === "/configured-monitors" ||
          currentPath === "/monitors/new" ||
          currentPath.startsWith("/monitors/"));
      const isHomeLink = href === "/" && currentPath === "/";
      const isDashboardsLink = href === "/dashboards" && (currentPath === "/dashboards" || currentPath.startsWith("/dashboards/"));
      const isAdminLink = href === "/admin" && (currentPath === "/admin" || currentPath.startsWith("/admin/"));
      link.classList.toggle("active", visible && (isHomeLink || isDashboardsLink || isAdminLink || href === currentPath || isMonitorsLink));
    }
  });
}

function renderMonitorsHomePage(checks) {
  setWorkspaceHeader("Monitors", "Open monitor tools, add new monitors, and browse every configured monitor from one place.", [
    { label: "Monitors" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");

  root.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>Monitor Workspace</h3>
          <p>Use this page as the hub for creating monitors, bulk-managing configured monitors, and opening each monitor on its own page.</p>
        </div>
        <div class="guide-grid">
          <a class="guide-card" href="/monitors/new" data-link>
            <h4>Add Monitor</h4>
            <p>Choose between a basic monitor flow and an advanced monitor flow.</p>
          </a>
          <a class="guide-card" href="/configured-monitors" data-link>
            <h4>Configured Monitors</h4>
            <p>Bulk-manage the existing monitor set and apply enable, disable, or delete actions across multiple entries.</p>
          </a>
        </div>
      </section>
    </div>
  `;
}

function renderAddMonitorHomePage() {
  setWorkspaceHeader("Add Monitor", "Choose the type of monitor workflow you want to start.", [
    { label: "Monitors", href: "/monitors" },
    { label: "Add Monitor" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>Monitor Creation Paths</h3>
          <p>Select the monitor creation experience you want to use.</p>
        </div>
        <div class="guide-grid">
          <a class="guide-card" href="/monitors/new/basic" data-link>
            <h4>Basic Monitor</h4>
            <p>Use the current monitor form for endpoint target, validation, placement, and authentication settings.</p>
          </a>
          <a class="guide-card" href="/monitors/new/advanced" data-link>
            <h4>Advanced Monitor</h4>
            <p>Reserved for a more advanced creation flow. This page is intentionally blank for now.</p>
          </a>
        </div>
      </section>
    </div>
  `;
}

function renderAdvancedMonitorPlaceholder() {
  setWorkspaceHeader("Advanced Monitor", "This workflow is reserved for future advanced monitor creation.", [
    { label: "Monitors", href: "/monitors" },
    { label: "Add Monitor", href: "/monitors/new" },
    { label: "Advanced Monitor" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h3>Advanced Monitor</h3>
        <p>This page is intentionally blank for now.</p>
      </div>
      <div class="guide-card">
        <h4>Coming Soon</h4>
        <p>The advanced monitor workflow has been reserved and can be filled in later without changing the navigation structure again.</p>
      </div>
    </section>
  `;
}

function renderAdvancedMonitorHomePage() {
  setWorkspaceHeader("Advanced Monitor", "Choose the advanced monitor workflow you want to use.", [
    { label: "Monitors", href: "/monitors" },
    { label: "Add Monitor", href: "/monitors/new" },
    { label: "Advanced Monitor" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>Advanced Monitor Paths</h3>
          <p>Select the advanced monitoring workflow you want to build out.</p>
        </div>
        <div class="guide-grid">
          <a class="guide-card" href="/monitors/new/advanced/browser-health-monitor" data-link>
            <h4>Browser Health Monitor</h4>
            <p>Create a browser-focused synthetic monitoring workflow.</p>
          </a>
          <a class="guide-card" href="/monitors/new/advanced/real-user-monitoring" data-link>
            <h4>Real User Monitoring</h4>
            <p>Prepare a workflow for capturing real user monitoring data and experiences.</p>
          </a>
          <a class="guide-card" href="/monitors/new/advanced/monitor-recorder" data-link>
            <h4>Monitor Recorder</h4>
            <p>Reserve a workflow for recording monitor journeys and reusable monitor definitions.</p>
          </a>
        </div>
      </section>
    </div>
  `;
}

function renderAdvancedMonitorSubpage(title, description) {
  setWorkspaceHeader(title, description, [
    { label: "Monitors", href: "/monitors" },
    { label: "Add Monitor", href: "/monitors/new" },
    { label: "Advanced Monitor", href: "/monitors/new/advanced" },
    { label: title },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="guide-card">
        <h4>Coming Soon</h4>
        <p>This advanced monitor page has been created and reserved. We can build out the actual workflow here next.</p>
      </div>
    </section>
  `;
}

function renderBreadcrumbs(items = []) {
  const container = document.getElementById("workspace-breadcrumbs");
  if (!container) return;
  if (!items.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = items
    .map((item, index) => {
      const node = item.href
        ? `<a href="${escapeHtml(item.href)}" data-link>${escapeHtml(item.label)}</a>`
        : `<span class="breadcrumb-current">${escapeHtml(item.label)}</span>`;
      const separator = index < items.length - 1 ? `<span class="breadcrumb-separator">/</span>` : "";
      return `${node}${separator}`;
    })
    .join("");
}

function setWorkspaceHeader(title, subtitle, breadcrumbs = []) {
  document.getElementById("workspace-title").textContent = title;
  document.getElementById("workspace-subtitle").textContent = subtitle;
  renderBreadcrumbs(breadcrumbs);
}

function renderLoginPage() {
  setWorkspaceHeader("Sign In", "Sign in to the portal, create a new account, or reset your password.", [
    { label: "Sign In" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="split-panels">
      <section class="panel">
        <div class="panel-head">
          <h3>Login</h3>
          <p>Use your portal credentials to access the monitoring home and dashboard workspaces.</p>
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

function renderBootstrapPage() {
  setWorkspaceHeader("Initial Admin Setup", "Create the first administrator account before anyone can use the application.", [
    { label: "Initial Admin Setup" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="split-panels">
      <section class="panel">
        <div class="panel-head">
          <h3>Onboard The First Admin</h3>
          <p>This appears to be a first-time startup. Create the initial administrator account to unlock the rest of the application.</p>
        </div>
        <form id="bootstrap-form" class="check-form">
          <label><span>First Name</span><input name="first_name" /></label>
          <label><span>Last Name</span><input name="last_name" /></label>
          <label><span>Admin Username</span><input name="username" required /></label>
          <label><span>Admin Password</span><input name="password" type="password" required /></label>
          <button type="submit">Create Admin And Continue</button>
          <p class="form-status" id="bootstrap-status"></p>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Why This Is Required</h3>
          <p>The application no longer ships with a default admin account. The first visitor must create the initial administrator before sign-in, user registration, and the rest of the portal become available.</p>
        </div>
      </section>
    </div>
  `;
}

function monitorEnabledPill(check) {
  return check.enabled
    ? `<span class="pill">Enabled</span>`
    : `<span class="pill neutral">Disabled</span>`;
}

function configuredMonitorFilters(checks) {
  const types = Array.from(new Set(checks.map((check) => check.type).filter(Boolean))).sort();
  return {
    query: state.configuredMonitors.query.trim().toLowerCase(),
    type: state.configuredMonitors.type,
    enabled: state.configuredMonitors.enabled,
    types,
  };
}

function applyConfiguredMonitorFilters(checks) {
  const filters = configuredMonitorFilters(checks);
  return checks.filter((check) => {
    const matchesQuery =
      !filters.query ||
      check.name.toLowerCase().includes(filters.query) ||
      checkCategoryLabel(check.type).toLowerCase().includes(filters.query);
    const matchesType = filters.type === "all" || check.type === filters.type;
    const matchesEnabled =
      filters.enabled === "all" ||
      (filters.enabled === "enabled" && check.enabled) ||
      (filters.enabled === "disabled" && !check.enabled);
    return matchesQuery && matchesType && matchesEnabled;
  });
}

function renderConfiguredMonitorsPage(checks) {
  setWorkspaceHeader("Configured Monitors", "Select one or more monitors and apply bulk enable, disable, or delete actions.", [
    { label: "Monitors", href: "/monitors" },
    { label: "Configured Monitors" },
  ]);
  document.getElementById("overview-cards").innerHTML = "";
  const root = document.getElementById("app-root");
  const sortedChecks = [...checks].sort((a, b) => a.name.localeCompare(b.name));
  const filters = configuredMonitorFilters(sortedChecks);
  const visibleChecks = applyConfiguredMonitorFilters(sortedChecks);
  const rows = visibleChecks.length
    ? visibleChecks
        .map(
          (check) => `
            <label class="bulk-monitor-row">
              <span class="bulk-monitor-check">
                <input type="checkbox" class="monitor-bulk-checkbox" value="${escapeHtml(check.name)}" />
              </span>
              <span class="bulk-monitor-name">
                <a href="/monitors/${encodeURIComponent(check.name)}" data-link>${escapeHtml(check.name)}</a>
              </span>
              <span class="bulk-monitor-type">${escapeHtml(checkCategoryLabel(check.type))}</span>
              <span class="bulk-monitor-state">${monitorEnabledPill(check)}</span>
            </label>
          `
        )
        .join("")
    : sortedChecks.length
      ? `<div class="guide-card"><h4>No monitors match the current filters</h4><p class="subtle">Adjust the search text or filter selections to broaden the list.</p></div>`
      : `<div class="guide-card"><h4>No monitors configured</h4><p class="subtle">Add your first monitor to start building a bulk-manageable list.</p></div>`;

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h3>Bulk Monitor Management</h3>
        <p>Select monitors from the list below, then use the bulk actions to manage large monitor sets quickly.</p>
      </div>
      <div class="bulk-filter-grid">
        <label>
          <span>Search</span>
          <input type="search" id="configured-monitors-search" placeholder="Find a monitor by name or type" value="${escapeHtml(state.configuredMonitors.query)}" />
        </label>
        <label>
          <span>Type</span>
          <select id="configured-monitors-type-filter">
            <option value="all" ${filters.type === "all" ? "selected" : ""}>All Types</option>
            ${filters.types
              .map((type) => `<option value="${escapeHtml(type)}" ${filters.type === type ? "selected" : ""}>${escapeHtml(checkCategoryLabel(type))}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select id="configured-monitors-enabled-filter">
            <option value="all" ${filters.enabled === "all" ? "selected" : ""}>Enabled + Disabled</option>
            <option value="enabled" ${filters.enabled === "enabled" ? "selected" : ""}>Enabled Only</option>
            <option value="disabled" ${filters.enabled === "disabled" ? "selected" : ""}>Disabled Only</option>
          </select>
        </label>
      </div>
      <div class="button-row">
        <button type="button" class="danger" id="bulk-delete-btn" ${hasRole("read_write") ? "" : "disabled"}>Delete</button>
        <button type="button" class="secondary" id="bulk-disable-btn" ${hasRole("read_write") ? "" : "disabled"}>Disable</button>
        <button type="button" id="bulk-enable-btn" ${hasRole("read_write") ? "" : "disabled"}>Enable</button>
      </div>
      <div class="status-meta bulk-toolbar">
        <label class="bulk-select-all">
          <input type="checkbox" id="configured-monitors-select-all" />
          <span>Select All</span>
        </label>
        <span id="configured-monitors-selection-count">0 selected</span>
        <span id="configured-monitors-visible-count">${visibleChecks.length} shown of ${sortedChecks.length}</span>
      </div>
      <p class="form-status" id="configured-monitors-status"></p>
      <div class="bulk-monitor-list">
        <div class="bulk-monitor-header">
          <span></span>
          <span>Monitor</span>
          <span>Type</span>
          <span>Status</span>
        </div>
        ${rows}
      </div>
    </section>
  `;
  updateConfiguredMonitorSelection();
}

function selectedMonitorNames() {
  return Array.from(document.querySelectorAll(".monitor-bulk-checkbox:checked")).map((node) => node.value);
}

function updateConfiguredMonitorSelection() {
  const checkboxes = Array.from(document.querySelectorAll(".monitor-bulk-checkbox"));
  const checked = checkboxes.filter((node) => node.checked);
  const countLabel = document.getElementById("configured-monitors-selection-count");
  const selectAll = document.getElementById("configured-monitors-select-all");
  if (countLabel) {
    countLabel.textContent = `${checked.length} selected`;
  }
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
  }
}

function updateConfiguredMonitorsFilters(event) {
  if (event.target.id === "configured-monitors-search") {
    state.configuredMonitors.query = event.target.value || "";
  }
  if (event.target.id === "configured-monitors-type-filter") {
    state.configuredMonitors.type = event.target.value || "all";
  }
  if (event.target.id === "configured-monitors-enabled-filter") {
    state.configuredMonitors.enabled = event.target.value || "all";
  }
}

async function runBulkMonitorAction(action) {
  if (!hasRole("read_write")) return;
  const names = selectedMonitorNames();
  const status = document.getElementById("configured-monitors-status");
  if (!names.length) {
    setStatus(status, "Select at least one monitor first.", true);
    return;
  }
  if (action === "delete" && !window.confirm(`Delete ${names.length} selected monitor(s)?`)) {
    return;
  }

  try {
    if (action === "enable" || action === "disable") {
      setStatus(status, `${action === "enable" ? "Enabling" : "Disabling"} ${names.length} monitor(s)...`);
      await api("/api/checks/bulk/enabled", {
        method: "PATCH",
        body: JSON.stringify({ names, enabled: action === "enable" }),
      });
      setStatus(status, `${action === "enable" ? "Enabled" : "Disabled"} ${names.length} monitor(s).`);
    } else {
      setStatus(status, `Deleting ${names.length} monitor(s)...`);
      await api("/api/checks/bulk/delete", {
        method: "POST",
        body: JSON.stringify({ names }),
      });
      setStatus(status, `Deleted ${names.length} monitor(s).`);
    }
    await renderRoute();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

function renderProfilePage(profile) {
  setWorkspaceHeader("Profile", "Review and update your personal account details.", [
    { label: "Profile" },
  ]);
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
  setWorkspaceHeader("Home", "Live endpoint availability and monitoring node health at a glance.", [
    { label: "Home" },
  ]);
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
        <details class="accordion-item aggregate-${nodeState}" data-dashboard-panel="monitoringNodes" ${state.dashboardPanels.monitoringNodes ? "open" : ""}>
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

        <details class="accordion-item aggregate-${enabledMonitorState}" data-dashboard-panel="enabledMonitors" ${state.dashboardPanels.enabledMonitors ? "open" : ""}>
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
      </section>

      <details class="accordion-item" data-dashboard-panel="disabledMonitors" ${state.dashboardPanels.disabledMonitors ? "open" : ""}>
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

function renderDashboardsPage(checks, checkMetrics, recentResults = []) {
  setWorkspaceHeader("Dashboards", "APM-style workspaces for service availability, latency, errors, and diagnostics.", [
    { label: "Dashboards" },
  ]);
  const root = document.getElementById("app-root");
  const sortedChecks = [...checks].sort((left, right) => {
    const rank = { unhealthy: 0, healthy: 1, disabled: 2, unknown: 3 };
    return (rank[left.status] ?? 9) - (rank[right.status] ?? 9) || left.name.localeCompare(right.name);
  });
  const visibleChecks = sortedChecks.filter((check) => dashboardMonitorMatches(check));
  const latestByCheck = Object.fromEntries(
    checks.map((check) => [monitorKey(check), monitorResults(check, recentResults)[0] || check.latest_result || null])
  );
  const unhealthyCount = checks.filter((check) => check.status === "unhealthy").length;
  const healthyCount = checks.filter((check) => check.status === "healthy").length;
  const disabledCount = checks.filter((check) => check.status === "disabled").length;
  const allVisiblePoints = visibleChecks.flatMap((check) => monitorPoints(check, checkMetrics));
  const fleetAvailability = availabilityPercent(allVisiblePoints);
  root.innerHTML = `
    <div class="stack">
      <section class="panel dashboards-hero-panel">
        <div class="dashboard-hero-grid">
          <div>
            <div class="panel-head" style="margin-bottom: 8px;">
              <h3>Monitor Dashboards</h3>
              <p>Compact APM views for service health, latency trends, incident signals, and diagnostics.</p>
            </div>
            <div class="dashboard-filter-bar">
              <label>
                <span>Search</span>
                <input
                  id="dashboards-search"
                  type="text"
                  placeholder="Find a monitor, target, or type"
                  value="${escapeHtml(state.dashboardWorkspace.query)}"
                />
              </label>
              <label>
                <span>Status</span>
                <select id="dashboards-status-filter">
                  <option value="all" ${state.dashboardWorkspace.status === "all" ? "selected" : ""}>All statuses</option>
                  <option value="healthy" ${state.dashboardWorkspace.status === "healthy" ? "selected" : ""}>Healthy</option>
                  <option value="unhealthy" ${state.dashboardWorkspace.status === "unhealthy" ? "selected" : ""}>Unhealthy</option>
                  <option value="disabled" ${state.dashboardWorkspace.status === "disabled" ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>Type</span>
                <select id="dashboards-type-filter">
                  <option value="all" ${state.dashboardWorkspace.type === "all" ? "selected" : ""}>All types</option>
                  <option value="http" ${state.dashboardWorkspace.type === "http" ? "selected" : ""}>HTTP</option>
                  <option value="api" ${state.dashboardWorkspace.type === "api" ? "selected" : ""}>API</option>
                  <option value="dns" ${state.dashboardWorkspace.type === "dns" ? "selected" : ""}>DNS</option>
                  <option value="auth" ${state.dashboardWorkspace.type === "auth" ? "selected" : ""}>Auth</option>
                  <option value="generic" ${state.dashboardWorkspace.type === "generic" ? "selected" : ""}>Generic</option>
                  <option value="database" ${state.dashboardWorkspace.type === "database" ? "selected" : ""}>Database</option>
                  <option value="browser" ${state.dashboardWorkspace.type === "browser" ? "selected" : ""}>Browser</option>
                </select>
              </label>
            </div>
          </div>
          <div class="dashboard-kpi-strip">
            <article class="compact-card dashboard-kpi-card">
              <h4>Services</h4>
              <p>${visibleChecks.length}</p>
              <span>${checks.length} total configured</span>
            </article>
            <article class="compact-card dashboard-kpi-card">
              <h4>Availability</h4>
              <p>${formatPercent(fleetAvailability)}</p>
              <span>${healthyCount} healthy · ${unhealthyCount} unhealthy</span>
            </article>
            <article class="compact-card dashboard-kpi-card">
              <h4>Active Incidents</h4>
              <p>${recentResults.filter((result) => !result.success).length}</p>
              <span>${disabledCount} disabled</span>
            </article>
          </div>
        </div>
      </section>

      <section class="panel dashboards-grid-panel">
        <div class="dashboard-card-grid">
          ${visibleChecks.length ? visibleChecks.map((check) => {
            const points = monitorPoints(check, checkMetrics);
            const latest = latestByCheck[monitorKey(check)];
            const checkResults = monitorResults(check, recentResults);
            const recentFailures = checkResults.filter((result) => !result.success).slice(0, 3);
            const avgLatency = averageDuration(points);
            const p50Latency = percentileDuration(points, 50);
            const p95Latency = percentileDuration(points, 95);
            const errorRate = errorRatePercent(points);
            const availability = availabilityPercent(points);
            const troubleshootingHint =
              check.status === "unhealthy"
                ? (latest?.message || "Latest run failed. Review auth, content rules, placement, and recent request timing.")
                : check.status === "disabled"
                  ? "This monitor is disabled, so no new sessions are being collected right now."
                  : "This monitor is healthy. Use the history and latest outcome to spot regressions before they become outages.";
            return `
              <article class="guide-card dashboard-monitor-card">
                <div class="dashboard-card-head">
                  <div>
                    <div class="summary-identity">
                      <span class="dot ${statusClass(check.status)}"></span>
                      <strong>${escapeHtml(check.name)}</strong>
                    </div>
                    <div class="status-meta">
                      <span>${escapeHtml(checkCategoryLabel(check.type))}</span>
                      <span>${escapeHtml(checkTargetLabel(check))}</span>
                    </div>
                  </div>
                  ${statusPill(check.status)}
                </div>
                <div class="guide-card compact-chart-card">
                  <div class="mini-panel-header">
                    <h4>Availability</h4>
                    <span>${escapeHtml(lastMetricLabel(points))}</span>
                  </div>
                  ${historyChartMarkup(points, dashboardVariant(check), 540, 116)}
                </div>
                <div class="guide-card compact-chart-card">
                  <div class="mini-panel-header">
                    <h4>Latency Trend</h4>
                    <span>${recentFailures.length ? `${recentFailures.length} recent failures` : "Stable signal"}</span>
                  </div>
                  ${latencyLineChartMarkup(points, 540, 116)}
                </div>
                <div class="dashboard-card-stats">
                  <div class="compact-card"><h4>Availability</h4><p>${formatPercent(availability)}</p></div>
                  <div class="compact-card"><h4>Avg Latency</h4><p>${formatDuration(avgLatency)}</p></div>
                  <div class="compact-card"><h4>P50 Latency</h4><p>${formatDuration(p50Latency)}</p></div>
                  <div class="compact-card"><h4>Error Rate</h4><p>${formatPercent(errorRate)}</p></div>
                  <div class="compact-card"><h4>P95 Latency</h4><p>${formatDuration(p95Latency)}</p></div>
                </div>
                <div class="guide-card dashboard-card-message">
                  <h4>Latest Signal</h4>
                  <p>${escapeHtml(latest?.message || troubleshootingHint)}</p>
                </div>
                <div class="button-row">
                  <a class="button-link" href="/dashboards/${encodeURIComponent(check.name)}" data-link>Open Dashboard</a>
                  <a class="button-link secondary" href="/monitors/${encodeURIComponent(check.name)}" data-link>Open Monitor</a>
                </div>
              </article>
            `;
          }).join("") : `<div class="guide-card"><p>No dashboards match the current filters.</p></div>`}
        </div>
      </section>
    </div>
  `;
}

function dashboardTabLinks(checkName, activeTab, activeRange = "24h") {
  const encoded = encodeURIComponent(checkName);
  const tabs = [
    ["overview", "Overview"],
    ["history", "History"],
    ["failures", "Failures"],
    ["troubleshooting", "Troubleshooting"],
  ];
  return `
    <div class="dashboard-tab-bar">
      ${tabs
        .map(
          ([tab, label]) => `
            <a
              href="/dashboards/${encoded}?tab=${tab}&range=${activeRange}"
              data-link
              class="dashboard-tab ${activeTab === tab ? "active" : ""}"
            >${label}</a>
          `
        )
        .join("")}
    </div>
  `;
}

function epochToDatetimeLocalValue(epochSeconds) {
  if (!epochSeconds) return "";
  const date = new Date(Number(epochSeconds) * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function datetimeLocalToEpoch(value) {
  if (!value) return null;
  const parsed = new Date(value);
  const millis = parsed.getTime();
  if (Number.isNaN(millis)) return null;
  return Math.floor(millis / 1000);
}

function dashboardRangeLinks(checkName, activeTab, activeRange = "24h", customStart = null, customEnd = null) {
  const encoded = encodeURIComponent(checkName);
  const ranges = [
    ["1h", "1 Hour"],
    ["24h", "24 Hours"],
    ["7d", "7 Days"],
    ["custom", "Custom"],
    ["all", "All"],
  ];
  return `
    <div class="dashboard-range-stack">
      <div class="dashboard-range-bar">
        ${ranges
          .map(
            ([range, label]) => `
              <a
                href="/dashboards/${encoded}?tab=${activeTab}&range=${range}"
                data-link
                class="dashboard-range-chip ${activeRange === range ? "active" : ""}"
              >${label}</a>
            `
          )
          .join("")}
      </div>
      ${activeRange === "custom" ? `
        <form id="dashboard-custom-range-form" class="dashboard-custom-range-form" data-check-name="${escapeHtml(checkName)}" data-tab="${activeTab}">
          <label>
            <span>Start</span>
            <input type="datetime-local" name="start" value="${escapeHtml(epochToDatetimeLocalValue(customStart))}" />
          </label>
          <label>
            <span>End</span>
            <input type="datetime-local" name="end" value="${escapeHtml(epochToDatetimeLocalValue(customEnd))}" />
          </label>
          <div class="button-row">
            <button type="submit">Apply Range</button>
            <a class="button-link secondary" href="/dashboards/${encoded}?tab=${activeTab}&range=24h" data-link>Reset</a>
          </div>
        </form>
      ` : ""}
    </div>
  `;
}

function filterPointsByRange(points, range = "24h", customStart = null, customEnd = null) {
  if (range === "custom") {
    return (Array.isArray(points) ? points : []).filter((point) => {
      const timestamp = Number(point.timestamp || 0);
      if (customStart != null && timestamp < customStart) return false;
      if (customEnd != null && timestamp > customEnd) return false;
      return true;
    });
  }
  if (range === "all") return Array.isArray(points) ? points : [];
  const now = Date.now() / 1000;
  const windowSeconds = range === "1h" ? 3600 : range === "7d" ? 604800 : 86400;
  return (Array.isArray(points) ? points : []).filter((point) => Number(point.timestamp || 0) >= now - windowSeconds);
}

function filterResultsByRange(results, range = "24h", customStart = null, customEnd = null) {
  if (range === "custom") {
    return (Array.isArray(results) ? results : []).filter((result) => {
      const timestamp = Number(result.timestamp || 0);
      if (customStart != null && timestamp < customStart) return false;
      if (customEnd != null && timestamp > customEnd) return false;
      return true;
    });
  }
  if (range === "all") return Array.isArray(results) ? results : [];
  const now = Date.now() / 1000;
  const windowSeconds = range === "1h" ? 3600 : range === "7d" ? 604800 : 86400;
  return (Array.isArray(results) ? results : []).filter((result) => Number(result.timestamp || 0) >= now - windowSeconds);
}

function dashboardRangeLabel(range = "24h", customStart = null, customEnd = null) {
  if (range === "1h") return "Last 1 hour";
  if (range === "7d") return "Last 7 days";
  if (range === "custom") {
    const startLabel = customStart ? fmtTime(customStart) : "the beginning";
    const endLabel = customEnd ? fmtTime(customEnd) : "now";
    return `${startLabel} to ${endLabel}`;
  }
  if (range === "all") return "All recorded data";
  return "Last 24 hours";
}

function recentFailureCards(failures) {
  if (!failures.length) {
    return `<div class="guide-card"><h4>No Failures</h4><p>No recent failures were recorded for this monitor.</p></div>`;
  }
  return failures
    .map(
      (result) => `
        <div class="guide-card">
          <h4>${escapeHtml(result.message || "Failure recorded")}</h4>
          <div class="status-meta">
            <span>${fmtTime(result.timestamp)}</span>
            <span>${formatDuration(result.duration_ms)}</span>
            <span>${escapeHtml(result.owner || "monitor-1")}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function monitorTroubleshootingHints(check, latest, failures) {
  const hints = [];
  if (check.status === "disabled") {
    hints.push("This monitor is disabled. Re-enable it before expecting new results or history.");
  }
  if (check.type === "auth") {
    hints.push("If auth failures appear, verify credentials, token freshness, and expected authenticated statuses.");
  }
  if (check.type === "http" || check.type === "browser") {
    hints.push("For page and endpoint failures, compare recent duration spikes, content rules, and upstream response changes.");
  }
  if (check.type === "dns") {
    hints.push("For DNS failures, compare address history and check whether the host resolves from the assigned monitoring node.");
  }
  if (check.type === "database") {
    hints.push("For database failures, confirm network reachability, credentials, port, and database name alignment.");
  }
  if (latest?.details?.status_code) {
    hints.push(`Latest returned status ${latest.details.status_code}. Confirm that expected statuses still match the target behavior.`);
  }
  if (failures.length) {
    hints.push("Open the dedicated monitor page to replay the monitor immediately and compare the new result with the latest failure snapshots.");
  } else {
    hints.push("This monitor has no recent failures. Use this dashboard to watch trend changes before they become incidents.");
  }
  return hints;
}

function renderMonitorDashboardPage(check, checkMetrics, recentResults = [], activeTab = "overview", activeRange = "24h", customStart = null, customEnd = null) {
  const allPoints = monitorPoints(check, checkMetrics);
  const allResults = monitorResults(check, recentResults);
  const points = filterPointsByRange(allPoints, activeRange, customStart, customEnd);
  const rangeResults = filterResultsByRange(allResults, activeRange, customStart, customEnd);
  const latest = rangeResults[0] || allResults[0] || check.latest_result || null;
  const failures = rangeResults.filter((result) => !result.success);
  const errors = errorTrendPoints(rangeResults.length ? rangeResults : allResults);
  const errorEvents = errors.reduce((sum, point) => sum + Number(point.error_count || 0), 0);
  const healthyCount = points.filter((point) => point.healthy).length;
  const failureCount = points.filter((point) => !point.healthy).length;
  const availability = availabilityPercent(points);
  const errorRate = errorRatePercent(points);
  const avgLatency = averageDuration(points);
  const p50Latency = percentileDuration(points, 50);
  const p95Latency = percentileDuration(points, 95);
  const p99Latency = percentileDuration(points, 99);
  const troubleshootingHints = monitorTroubleshootingHints(check, latest, failures);
  state.dashboardDetailContext = { check, failures, points, recentResults: rangeResults, activeRange, customStart, customEnd };
  const diagnosticsMarkup = recentRunDiagnosticsMarkup(check, rangeResults.length ? rangeResults : allResults);
  const sloMarkup = sloBudgetMarkup(points);
  const alertMarkup = alertThresholdsMarkup(check, points);

  let tabContent = "";
  if (activeTab === "history") {
    tabContent = `
      <section class="panel">
        <div class="panel-head">
          <h3>History</h3>
          <p>Recent executions, latency, and availability trends for this monitor in ${dashboardRangeLabel(activeRange, customStart, customEnd).toLowerCase()}.</p>
        </div>
        <div class="guide-grid">
          <div class="guide-card compact-card">
            <h4>Healthy Runs</h4>
            <p>${healthyCount}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Failed Runs</h4>
            <p>${failureCount}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Traffic</h4>
            <p>${points.length}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Error Events</h4>
            <p>${errorEvents}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Last Fired</h4>
            <p>${escapeHtml(lastMetricLabel(points))}</p>
          </div>
        </div>
        ${sloMarkup}
        <div class="dashboard-detail-grid" style="margin-top: 12px;">
          <div class="guide-card dashboard-history-chart">
            <div class="mini-panel-header">
              <h4>Availability Trend</h4>
              <span>Last ${points.length || 0} runs</span>
            </div>
            ${historyChartMarkup(points, dashboardVariant(check))}
          </div>
          <div class="guide-card dashboard-history-chart">
            <div class="mini-panel-header">
              <h4>Latency Trend</h4>
              <span>Response time over time</span>
            </div>
            ${latencyLineChartMarkup(points)}
          </div>
          <div class="guide-card dashboard-history-chart dashboard-span-full">
            <div class="mini-panel-header">
              <h4>Error Trend</h4>
              <span>${errorEvents} error events in range</span>
            </div>
            ${errorTrendChartMarkup(errors)}
          </div>
        </div>
        <div class="stack" style="margin-top: 12px;">
          ${points.length ? points.slice().reverse().map((point) => `
            <div class="status-row compact">
              <span class="dot ${point.healthy ? "healthy" : "unhealthy"}"></span>
              <div>
                <strong>${point.healthy ? "Healthy run" : "Failed run"}</strong>
                <div class="status-meta">
                  <span>${fmtTime(point.timestamp)}</span>
                  <span>${formatDuration(point.duration_ms)}</span>
                </div>
              </div>
              ${statusPill(point.healthy ? "healthy" : "unhealthy")}
            </div>
          `).join("") : `<div class="guide-card"><p>No historical points have been recorded yet.</p></div>`}
        </div>
      </section>
    `;
  } else if (activeTab === "failures") {
    tabContent = `
      <section class="panel">
        <div class="panel-head">
          <h3>Failures</h3>
          <p>Incident timeline, failure sessions, and degraded latency context for this monitor in ${dashboardRangeLabel(activeRange, customStart, customEnd).toLowerCase()}.</p>
        </div>
        <div class="button-row">
          <button type="button" id="export-incident-timeline-btn" class="secondary">Export Incident Timeline</button>
          <a class="button-link secondary" href="/dashboards/${encodeURIComponent(check.name)}?tab=history&range=${activeRange}" data-link>Compare With History</a>
        </div>
        <div class="dashboard-detail-grid" style="margin-top: 12px;">
          <div class="guide-card dashboard-history-chart">
            <div class="mini-panel-header">
              <h4>Failure Trend</h4>
              <span>${failures.length} failure events</span>
            </div>
            ${historyChartMarkup(points, check.status === "unhealthy" ? "bad" : "good")}
          </div>
          <div class="guide-card dashboard-history-chart">
            <div class="mini-panel-header">
              <h4>Failure Output</h4>
              <span>Latency during degraded runs</span>
            </div>
            ${outcomeBarsMarkup(points)}
          </div>
        </div>
        <div class="guide-card" style="margin-top: 12px;">
          <div class="mini-panel-header">
            <h4>Incident Timeline</h4>
            <span>${failures.length ? "Failure sequence" : "No incidents"}</span>
          </div>
          ${incidentTimelineMarkup(failures)}
        </div>
        <div class="stack">
          ${recentFailureCards(failures)}
        </div>
      </section>
    `;
  } else if (activeTab === "troubleshooting") {
    tabContent = `
      <section class="panel">
        <div class="panel-head">
          <h3>Troubleshooting</h3>
          <p>Action-oriented diagnostics based on monitor type, latency, availability, and recent failures in ${dashboardRangeLabel(activeRange, customStart, customEnd).toLowerCase()}.</p>
        </div>
        <div class="stack">
          ${troubleshootingHints.map((hint) => `<div class="guide-card"><p>${escapeHtml(hint)}</p></div>`).join("")}
          <div class="guide-card">
            <h4>Quick Actions</h4>
            <div class="button-row">
              <a class="button-link" href="/monitors/${encodeURIComponent(check.name)}" data-link>Open Monitor</a>
              <a class="button-link secondary" href="/dashboards/${encodeURIComponent(check.name)}?tab=failures&range=${activeRange}" data-link>View Failures</a>
              <a class="button-link secondary" href="/dashboards/${encodeURIComponent(check.name)}?tab=history&range=${activeRange}" data-link>View History</a>
            </div>
          </div>
        </div>
      </section>
    `;
  } else {
    tabContent = `
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
          <h3>Overview</h3>
          <p>Golden-signal style health, latency, and execution insights for ${dashboardRangeLabel(activeRange, customStart, customEnd).toLowerCase()}.</p>
          </div>
          <div class="status-row">
            <span class="dot ${statusClass(check.status)}"></span>
            <div>
              <strong>${escapeHtml(check.name)}</strong>
              <div class="status-meta">
                <span>${escapeHtml(checkCategoryLabel(check.type))}</span>
                <span>${escapeHtml(checkTargetLabel(check))}</span>
                <span>Owner ${escapeHtml(check.owner || "monitor-1")}</span>
              </div>
            </div>
            <div>${historyChartMarkup(points, check.status === "unhealthy" ? "bad" : check.status === "disabled" ? "neutral" : "good", 320, 120)}</div>
            ${statusPill(check.status)}
            <span class="subtle">${escapeHtml(latest?.message || "No recent result")}</span>
          </div>
          <div class="guide-grid" style="margin-top: 12px;">
            <div class="guide-card compact-card">
              <h4>Availability</h4>
              <p>${formatPercent(availability)}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>Avg Latency</h4>
              <p>${formatDuration(avgLatency)}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>P50 Latency</h4>
              <p>${formatDuration(p50Latency)}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>P95 Latency</h4>
              <p>${formatDuration(p95Latency)}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>P99 Latency</h4>
              <p>${formatDuration(p99Latency)}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>Error Rate</h4>
              <p>${formatPercent(errorRate)}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>Traffic</h4>
              <p>${points.length}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>Error Events</h4>
              <p>${errorEvents}</p>
            </div>
            <div class="guide-card compact-card">
              <h4>Last Fired</h4>
              <p>${escapeHtml(lastMetricLabel(points))}</p>
            </div>
          </div>
          <div class="dashboard-detail-grid" style="margin-top: 12px;">
            <section class="panel dashboard-subpanel">
              <div class="panel-head">
                <h3>Session Diagnostics</h3>
                <p>The latest monitor session details, current signal, and next best actions.</p>
              </div>
              <div class="stack">
                <div class="guide-card">
                  <h4>Latest Message</h4>
                  <p>${escapeHtml(latest?.message || "No session outcome recorded yet.")}</p>
                </div>
                <div class="guide-card">
                  <h4>Recommended Next Step</h4>
                  <p>${escapeHtml(troubleshootingHints[0] || "Open the monitor and re-run it to gather fresh telemetry.")}</p>
                </div>
                <div class="guide-card">
                  <h4>Open Monitor</h4>
                  <div class="button-row">
                    <a class="button-link" href="/monitors/${encodeURIComponent(check.name)}" data-link>Edit Monitor</a>
                    <a class="button-link secondary" href="/dashboards/${encodeURIComponent(check.name)}?tab=troubleshooting&range=${activeRange}" data-link>Troubleshoot</a>
                    <a class="button-link secondary" href="/dashboards/${encodeURIComponent(check.name)}?tab=failures&range=${activeRange}" data-link>Open Failures</a>
                  </div>
                </div>
              </div>
            </section>
            ${alertMarkup}
          </div>
          ${sloMarkup}
          <div class="dashboard-detail-grid" style="margin-top: 12px;">
            <div class="guide-card dashboard-history-chart">
              <div class="mini-panel-header">
                <h4>Availability Trend</h4>
                <span>${escapeHtml(lastMetricLabel(points))}</span>
              </div>
              ${historyChartMarkup(points, dashboardVariant(check))}
            </div>
            <div class="guide-card dashboard-history-chart">
              <div class="mini-panel-header">
                <h4>Latency Trend</h4>
                <span>P50 ${formatDuration(p50Latency)} · P95 ${formatDuration(p95Latency)} · P99 ${formatDuration(p99Latency)}</span>
              </div>
              ${latencyLineChartMarkup(points)}
            </div>
            <div class="guide-card dashboard-history-chart dashboard-span-full">
              <div class="mini-panel-header">
                <h4>Error Trend</h4>
                <span>${errorEvents} error events in range</span>
              </div>
              ${errorTrendChartMarkup(errors)}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  setWorkspaceHeader(`${check.name} Dashboard`, "A dedicated observability workspace for monitor health, outcomes, history, and troubleshooting.", [
    { label: "Dashboards", href: "/dashboards" },
    { label: check.name },
  ]);
  document.getElementById("app-root").innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>${escapeHtml(check.name)}</h3>
          <p>Monitor-specific dashboard tabs for insights, failures, and troubleshooting workflows.</p>
        </div>
        ${dashboardTabLinks(check.name, activeTab, activeRange)}
        ${dashboardRangeLinks(check.name, activeTab, activeRange, customStart, customEnd)}
      </section>
      ${tabContent}
      ${diagnosticsMarkup}
    </div>
  `;
}

function authSummary(check) {
  if (!check.auth) return "No auth configured";
  if (check.auth.type === "bearer") return "Bearer token";
  if (check.auth.type === "basic") return `Basic auth${check.auth.username ? ` as ${check.auth.username}` : ""}`;
  return `Header auth${check.auth.header_name ? ` via ${check.auth.header_name}` : ""}`;
}

function assignableNodeOptions(cluster) {
  const localNodeId = cluster?.node_id || state.session?.node_id || "monitor-1";
  const localScope = cluster?.local_monitor_scope === "peer_only" ? "Peer only" : "Full monitoring";
  const nodes = [
    {
      node_id: localNodeId,
      container_name: localNodeId,
      enabled: true,
      healthy: (cluster?.healthy_nodes || []).includes(localNodeId),
      monitor_scope: cluster?.local_monitor_scope || "full",
      label: `Local node (${localNodeId})`,
      description: localScope,
    },
    ...((cluster?.peers || []).map((peer) => ({
      ...peer,
      label: peer.container_name ? `${peer.node_id} (${peer.container_name})` : peer.node_id,
      description: peer.monitor_scope === "peer_only" ? "Peer only" : "Full monitoring",
    }))),
  ];

  return nodes.filter((node, index, list) => {
    if (node.monitor_scope === "peer_only") {
      return false;
    }
    return list.findIndex((item) => item.node_id === node.node_id) === index;
  });
}

function alertThresholdFieldsMarkup(check, editable) {
  const thresholds = { ...defaultAlertThresholds(), ...(check.alert_thresholds || {}) };
  const readonlyAttr = editable ? "" : "disabled";
  const manual = thresholds.mode === "manual";
  return `
    <details class="accordion-item" ${check?.name ? "open" : ""}>
      <summary class="accordion-summary">
        <div>
          <strong>Alert Thresholds</strong>
          <div class="status-meta">
            <span>${thresholds.mode === "manual" ? "Manual thresholds" : "Auto learned thresholds"}</span>
          </div>
        </div>
      </summary>
      <div class="accordion-body">
        <label>
          <span>Threshold Mode</span>
          <select name="alert_threshold_mode" ${readonlyAttr}>
            <option value="auto" ${thresholds.mode !== "manual" ? "selected" : ""}>Auto learn from monitor behavior</option>
            <option value="manual" ${thresholds.mode === "manual" ? "selected" : ""}>Manual thresholds</option>
          </select>
        </label>
        <div class="guide-card">
          <h4>Threshold Strategy</h4>
          <p>${thresholds.mode === "manual" ? "Manual mode lets you set explicit warning and critical levels for this monitor." : "Auto mode derives thresholds from recent behavior so the dashboard can adapt to the monitor's normal baseline."}</p>
        </div>
        <div class="threshold-manual-fields ${manual ? "" : "hidden"}">
          <div class="guide-grid">
            <label><span>Availability Warning %</span><input name="availability_warning" type="number" step="0.1" value="${escapeHtml(thresholds.availability_warning)}" ${readonlyAttr} /></label>
            <label><span>Availability Critical %</span><input name="availability_critical" type="number" step="0.1" value="${escapeHtml(thresholds.availability_critical)}" ${readonlyAttr} /></label>
            <label><span>Error Rate Warning %</span><input name="error_rate_warning" type="number" step="0.1" value="${escapeHtml(thresholds.error_rate_warning)}" ${readonlyAttr} /></label>
            <label><span>Error Rate Critical %</span><input name="error_rate_critical" type="number" step="0.1" value="${escapeHtml(thresholds.error_rate_critical)}" ${readonlyAttr} /></label>
            <label><span>P95 Warning ms</span><input name="p95_latency_warning_ms" type="number" step="1" value="${escapeHtml(thresholds.p95_latency_warning_ms)}" ${readonlyAttr} /></label>
            <label><span>P95 Critical ms</span><input name="p95_latency_critical_ms" type="number" step="1" value="${escapeHtml(thresholds.p95_latency_critical_ms)}" ${readonlyAttr} /></label>
            <label><span>P99 Warning ms</span><input name="p99_latency_warning_ms" type="number" step="1" value="${escapeHtml(thresholds.p99_latency_warning_ms)}" ${readonlyAttr} /></label>
            <label><span>P99 Critical ms</span><input name="p99_latency_critical_ms" type="number" step="1" value="${escapeHtml(thresholds.p99_latency_critical_ms)}" ${readonlyAttr} /></label>
          </div>
        </div>
      </div>
    </details>
  `;
}

function disableForm(form, disabled) {
  form.querySelectorAll("input, select, button").forEach((element) => {
    if (element.dataset.alwaysEnabled === "true") {
      return;
    }
    element.disabled = disabled;
  });
}

function parseHeaderLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) {
        return null;
      }
      const name = line.slice(0, separator).trim();
      const headerValue = line.slice(separator + 1).trim();
      return name ? { name, value: headerValue } : null;
    })
    .filter(Boolean);
}

function parseExpectedHeaderLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) {
        return null;
      }
      const name = line.slice(0, separator).trim();
      const expected_value = line.slice(separator + 1).trim();
      return name ? { name, expected_value } : null;
    })
    .filter(Boolean);
}

function formatHeaderLines(headers = [], expected = false) {
  return (headers || [])
    .map((header) => `${header.name || ""}: ${expected ? header.expected_value || "" : header.value || ""}`.trim())
    .join("\n");
}

function basicMonitorBuilderPreviewMarkup(result) {
  const details = result?.details || {};
  const request = details.request || {};
  const response = details.response || {};
  const retry = details.retry || {};
  const assertionText = Array.isArray(details.assertions)
    ? details.assertions
        .map((item) => `${item.success ? "PASS" : "FAIL"}: ${item.message || item.name || "assertion"}`)
        .join("\n")
    : "";
  return `
    <aside class="panel monitor-builder-preview">
      <div class="panel-head">
        <h3>Live Test Console</h3>
        <p>${result ? "Request, response, and body details from the last builder test." : "Run a test to populate the live request and response preview."}</p>
      </div>
      ${
        result
          ? `
            <div class="builder-preview-stack">
              <div class="guide-card compact-card">
                <h4>Latest Outcome</h4>
                <p>${escapeHtml(result.message || "No message")}</p>
                <div class="status-meta">
                  <span>${statusLabel(result.success ? "healthy" : "unhealthy")}</span>
                  <span>${formatDuration(result.duration_ms)}</span>
                  <span>${retry.attempts || 1} of ${retry.max_attempts || 1} attempt(s)</span>
                </div>
              </div>
              <div class="guide-card">
                <h4>Request Preview</h4>
                <pre class="mono builder-preview-block">${escapeHtml(JSON.stringify(request, null, 2))}</pre>
              </div>
              <div class="guide-card">
                <h4>Response Preview</h4>
                <pre class="mono builder-preview-block">${escapeHtml(JSON.stringify({
                  status_code: response.status_code,
                  url: response.url,
                  headers: response.headers,
                }, null, 2))}</pre>
              </div>
              <div class="guide-card">
                <h4>Response Body</h4>
                <pre class="mono builder-preview-block builder-preview-body">${escapeHtml(response.body || response.body_preview || "")}</pre>
              </div>
              <div class="guide-card ${assertionText ? "" : "hidden"}">
                <h4>Assertion Results</h4>
                <pre class="mono builder-preview-block">${escapeHtml(assertionText)}</pre>
              </div>
            </div>
          `
          : `
            <div class="guide-card">
              <h4>No Test Yet</h4>
              <p>Fill out the request details, run a test, and this panel will show the full request preview, response preview, response body, and assertion results.</p>
            </div>
          `
      }
    </aside>
  `;
}

function basicMonitorBuilderMarkup(
  check,
  cluster = { node_id: "monitor-1", peers: [], healthy_nodes: [] },
  testResult = null
) {
  const nodes = assignableNodeOptions(cluster);
  const auth = check.auth || {};
  const authType = auth.type || (check.type === "auth" ? "bearer" : "none");
  const placementMode = check.placement_mode || "auto";
  const requestLike = ["http", "auth", "api"].includes(check.type);
  const requestBodyMode = check.request_body_mode || "none";
  const retry = check.retry || {};
  const builderHasTest = Boolean(testResult);
  return `
    <div class="monitor-builder-layout">
      <section class="stack">
        <form class="check-form monitor-builder-form" id="monitor-form" data-original-name="" data-original-id="">
          <section class="panel">
            <div class="panel-head">
              <h3>Basic Monitor Builder</h3>
              <p>Build a monitor step by step, test it in place, then save it once the request and assertions look right.</p>
            </div>
            <div class="stack">
              <div class="guide-card">
                <h4>1. Select Request Type</h4>
                <label>
                  <span>Monitor Type</span>
                  <select name="type">
                    <option value="http" ${check.type === "http" ? "selected" : ""}>HTTP</option>
                    <option value="api" ${check.type === "api" ? "selected" : ""}>API</option>
                    <option value="auth" ${check.type === "auth" ? "selected" : ""}>Auth</option>
                    <option value="dns" ${check.type === "dns" ? "selected" : ""}>DNS</option>
                    <option value="database" ${check.type === "database" ? "selected" : ""}>Database</option>
                    <option value="generic" ${check.type === "generic" ? "selected" : ""}>Generic</option>
                  </select>
                </label>
              </div>

              <div class="guide-card builder-section-request">
                <h4>2. Define Request</h4>
                <div class="guide-grid">
                  <label class="field-url ${requestLike ? "" : "hidden"}"><span>URL</span><input name="url" value="${escapeHtml(check.url || "")}" placeholder="https://api.example.com/v1/orders" /></label>
                  <label class="field-host ${requestLike ? "hidden" : ""} ${["dns", "database", "generic"].includes(check.type) ? "" : "hidden"}"><span>Host</span><input name="host" value="${escapeHtml(check.host || "")}" placeholder="service.internal" /></label>
                  <label class="field-port ${check.type !== "dns" ? "" : "hidden"}"><span>Port</span><input name="port" type="number" min="1" max="65535" value="${escapeHtml(check.port || "")}" placeholder="443" /></label>
                  <label class="builder-request-method ${requestLike ? "" : "hidden"}">
                    <span>Method</span>
                    <select name="request_method">
                      ${["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => `<option value="${method}" ${check.request_method === method ? "selected" : ""}>${method}</option>`).join("")}
                    </select>
                  </label>
                  <label class="builder-request-body-mode ${requestLike ? "" : "hidden"}">
                    <span>Body Mode</span>
                    <select name="request_body_mode">
                      <option value="none" ${requestBodyMode === "none" ? "selected" : ""}>No Body</option>
                      <option value="json" ${requestBodyMode === "json" ? "selected" : ""}>JSON</option>
                      <option value="text" ${requestBodyMode === "text" ? "selected" : ""}>Text</option>
                    </select>
                  </label>
                </div>
                <label class="builder-request-headers ${requestLike ? "" : "hidden"}">
                  <span>Request Headers</span>
                  <textarea name="request_headers_text" rows="5" placeholder="Accept: application/json&#10;X-Correlation-Id: monitor-build">${escapeHtml(formatHeaderLines(check.request_headers || []))}</textarea>
                </label>
                <label class="builder-request-body ${requestLike && requestBodyMode !== "none" ? "" : "hidden"}">
                  <span>Request Body</span>
                  <textarea name="request_body" rows="8" placeholder='{"customerId":"12345"}'>${escapeHtml(check.request_body || "")}</textarea>
                </label>
                <details class="accordion-item auth-only ${requestLike ? "" : "hidden"}">
                  <summary class="accordion-summary">
                    <div>
                      <strong>Authentication</strong>
                      <div class="status-meta">
                        <span>Optional credentials or auth headers for protected APIs and endpoints</span>
                      </div>
                    </div>
                  </summary>
                  <div class="accordion-body">
                    <label data-auth-field="type">
                      <span>Auth Type</span>
                      <select name="auth_type">
                        <option value="none" ${authType === "none" ? "selected" : ""}>None</option>
                        <option value="bearer" ${authType === "bearer" ? "selected" : ""}>Bearer</option>
                        <option value="basic" ${authType === "basic" ? "selected" : ""}>Basic</option>
                        <option value="header" ${authType === "header" ? "selected" : ""}>Header</option>
                      </select>
                    </label>
                    <label data-auth-field="token" class="${authType === "bearer" ? "" : "hidden"}"><span>Bearer Token</span><input name="token" value="${escapeHtml(auth.token || "")}" /></label>
                    <label data-auth-field="username" class="${authType === "basic" ? "" : "hidden"}"><span>Username</span><input name="username" value="${escapeHtml(auth.username || "")}" /></label>
                    <label data-auth-field="password" class="${authType === "basic" ? "" : "hidden"}"><span>Password</span><input name="password" type="password" value="${escapeHtml(auth.password || "")}" /></label>
                    <label data-auth-field="header_name" class="${authType === "header" ? "" : "hidden"}"><span>Header Name</span><input name="header_name" value="${escapeHtml(auth.header_name || "")}" /></label>
                    <label data-auth-field="header_value" class="${authType === "header" ? "" : "hidden"}"><span>Header Value</span><input name="header_value" value="${escapeHtml(auth.header_value || "")}" /></label>
                  </div>
                </details>
                <div class="button-row">
                  <button type="button" class="secondary" id="test-monitor-btn">Test Request</button>
                </div>
                <p class="form-status" id="monitor-form-status"></p>
              </div>

              <div class="guide-card builder-section-assertions ${builderHasTest ? "" : "builder-locked"}">
                <h4>3. Define Assertions</h4>
                <p class="subtle">${builderHasTest ? "Tune the assertions using the live test output on the right." : "Run a request test first. This section becomes much easier to configure once the builder has a real response to work from."}</p>
                <div class="guide-grid">
                  <label class="${requestLike ? "" : "hidden"}"><span>Expected Status Codes</span><input name="expected_statuses" value="${escapeHtml(csv(check.expected_statuses || [200]))}" placeholder="200,201" /></label>
                  <label class="${requestLike ? "" : "hidden"}"><span>Max Response Time (ms)</span><input name="max_response_time_ms" type="number" min="1" value="${escapeHtml(check.max_response_time_ms || "")}" placeholder="1500" /></label>
                </div>
                <label class="${requestLike ? "" : "hidden"}">
                  <span>Expected Response Headers</span>
                  <textarea name="expected_headers_text" rows="4" placeholder="content-type: application/json&#10;cache-control: no-store">${escapeHtml(formatHeaderLines(check.expected_headers || [], true))}</textarea>
                </label>
                <label class="${requestLike ? "" : "hidden"}"><span>Body Must Contain</span><input name="contains" value="${escapeHtml(csv(check.content_rules?.contains || []))}" placeholder="success,orderId" /></label>
                <label class="${requestLike ? "" : "hidden"}"><span>Body Must Not Contain</span><input name="not_contains" value="${escapeHtml(csv(check.content_rules?.not_contains || []))}" placeholder="error,failure" /></label>
                <label class="${requestLike ? "" : "hidden"}"><span>Regex Match</span><input name="regex" value="${escapeHtml(check.content_rules?.regex || "")}" placeholder="\"status\"\\s*:\\s*\"ok\"" /></label>
              </div>

              <div class="guide-card">
                <h4>4. Define Retry Conditions</h4>
                <div class="guide-grid">
                  <label><span>Attempts</span><input name="retry_attempts" type="number" min="1" value="${escapeHtml(retry.attempts || 1)}" /></label>
                  <label><span>Delay Seconds</span><input name="retry_delay_seconds" type="number" min="0" step="0.1" value="${escapeHtml(retry.delay_seconds || 0)}" /></label>
                </div>
                <label class="${requestLike ? "" : "hidden"}"><span>Retry On Status Codes</span><input name="retry_on_statuses" value="${escapeHtml(csv(retry.retry_on_statuses || []))}" placeholder="429,500,502,503,504" /></label>
                <div class="guide-grid">
                  <label>
                    <span>Retry On Timeout</span>
                    <select name="retry_on_timeout">
                      <option value="true" ${retry.retry_on_timeout !== false ? "selected" : ""}>Yes</option>
                      <option value="false" ${retry.retry_on_timeout === false ? "selected" : ""}>No</option>
                    </select>
                  </label>
                  <label>
                    <span>Retry On Connection Error</span>
                    <select name="retry_on_connection_error">
                      <option value="true" ${retry.retry_on_connection_error !== false ? "selected" : ""}>Yes</option>
                      <option value="false" ${retry.retry_on_connection_error === false ? "selected" : ""}>No</option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="guide-card">
                <h4>5. Define Scheduling And Alert Conditions</h4>
                <div class="guide-grid">
                  <label><span>Interval Seconds</span><input name="interval_seconds" type="number" min="1" value="${escapeHtml(check.interval_seconds || 300)}" /></label>
                  <label><span>Timeout Seconds</span><input name="timeout_seconds" type="number" min="1" value="${escapeHtml(check.timeout_seconds || 10)}" /></label>
                </div>
                <div class="guide-grid">
                  <label>
                    <span>Placement</span>
                    <select name="placement_mode">
                      <option value="auto" ${placementMode !== "specific" ? "selected" : ""}>Auto-select the healthiest least-loaded container</option>
                      <option value="specific" ${placementMode === "specific" ? "selected" : ""}>Choose a specific monitoring container</option>
                    </select>
                  </label>
                  <label class="field-assigned-node ${placementMode === "specific" ? "" : "hidden"}">
                    <span>Monitoring Container</span>
                    <select name="assigned_node_id">
                      <option value="">Select a monitoring container</option>
                      ${nodes
                        .map(
                          (node) => `<option value="${escapeHtml(node.node_id)}" ${check.assigned_node_id === node.node_id ? "selected" : ""}>${escapeHtml(node.label)}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                </div>
                ${alertThresholdFieldsMarkup(check, true)}
              </div>

              <div class="guide-card">
                <h4>6. Configure The Monitor</h4>
                <div class="guide-grid">
                  <label><span>Monitor Name</span><input name="name" value="${escapeHtml(check.name || "")}" placeholder="Orders API" required /></label>
                  <label>
                    <span>Enabled State</span>
                    <select name="enabled">
                      <option value="true" ${check.enabled !== false ? "selected" : ""}>Enabled</option>
                      <option value="false" ${check.enabled === false ? "selected" : ""}>Disabled</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
            <div class="button-row monitor-builder-actions">
              <button type="button" class="secondary" id="abandon-monitor-builder-btn">Abandon</button>
              <button type="submit">Create Monitor</button>
            </div>
          </section>
        </form>
      </section>
      ${basicMonitorBuilderPreviewMarkup(testResult)}
    </div>
  `;
}

function browserMonitorBuilderPreviewMarkup(result) {
  return `
    <aside class="panel monitor-builder-preview" id="browser-builder-preview">
      <div class="panel-head">
        <h3>Live Test Console</h3>
        <p>${result ? "Browser timing, journey status, and diagnostics from the last live test." : "Run a browser test to populate the journey timing, step status, network diagnostics, and page errors."}</p>
      </div>
      ${
        result
          ? browserDiagnosticsMarkup(result, { compact: true })
          : `
            <div class="guide-card">
              <h4>No Test Yet</h4>
              <p>Define the page target, run a test, and this panel will fill with browser timing, network activity, console messages, and script errors.</p>
            </div>
          `
      }
    </aside>
  `;
}

function browserMonitorBuilderMarkup(check, mode, cluster = { node_id: "monitor-1", peers: [], healthy_nodes: [] }, testResult = null) {
  const isNew = mode === "create";
  const canWrite = hasRole("read_write");
  const placementMode = check.placement_mode || "auto";
  const nodes = assignableNodeOptions(cluster);
  const selectedNodeId = check.assigned_node_id || "";
  const browser = check.browser || {};
  const steps = Array.isArray(browser.steps) && browser.steps.length ? browser.steps : [];
  const activeResult = testResult || (!isNew ? check.latest_result || null : null);
  return `
    <div class="monitor-builder-layout">
      <section class="stack">
        ${isNew ? "" : `
          <section class="panel">
            <div class="panel-head">
              <h3>Monitor Status</h3>
              <p>Latest browser outcome, ownership, and the current health of the synthetic journey.</p>
            </div>
            <div class="status-row">
              <span class="dot ${statusClass(check.status)}"></span>
              <div>
                <strong>${escapeHtml(check.name || "Browser monitor")}</strong>
                <div class="status-meta">
                  <span>Browser</span>
                  <span>${escapeHtml(check.url || "")}</span>
                </div>
              </div>
              <div>${sparklineMarkup(check.metric_points || [], check.status === "unhealthy" ? "bad" : "good")}</div>
              ${statusPill(check.status || "unknown")}
              <span class="subtle">${escapeHtml(check.latest_result?.message || "No result yet")}</span>
            </div>
          </section>
        `}
        <form class="check-form monitor-builder-form" id="browser-monitor-form" data-original-name="${escapeHtml(check.name || "")}" data-original-id="${escapeHtml(check.id || "")}">
          <section class="panel">
            <div class="panel-head">
              <h3>${isNew ? "Browser Health Monitor Builder" : `Edit ${escapeHtml(check.name)}`}</h3>
              <p>Define the browser target, test the page, refine the journey, and then save the synthetic monitor when the diagnostics look right.</p>
            </div>
            <div class="stack">
              <div class="guide-card">
                <h4>1. Define The Browser Target</h4>
                <div class="guide-grid">
                  <label><span>Page URL</span><input name="url" value="${escapeHtml(check.url || "")}" placeholder="https://example.com" required ${canWrite ? "" : "disabled"} /></label>
                  <label><span>Port</span><input name="port" type="number" min="1" max="65535" value="${escapeHtml(check.port || "")}" placeholder="Optional" ${canWrite ? "" : "disabled"} /></label>
                  <label><span>Wait Until</span><select name="browser_wait_until" ${canWrite ? "" : "disabled"}><option value="networkidle" ${browser.wait_until === "networkidle" || !browser.wait_until ? "selected" : ""}>Network Idle</option><option value="load" ${browser.wait_until === "load" ? "selected" : ""}>Load</option><option value="domcontentloaded" ${browser.wait_until === "domcontentloaded" ? "selected" : ""}>DOMContentLoaded</option></select></label>
                  <label><span>Timeout Seconds</span><input name="timeout_seconds" type="number" min="1" value="${escapeHtml(check.timeout_seconds || 30)}" ${canWrite ? "" : "disabled"} /></label>
                  <label><span>Viewport Width</span><input name="browser_viewport_width" type="number" min="320" value="${escapeHtml(browser.viewport_width || 1440)}" ${canWrite ? "" : "disabled"} /></label>
                  <label><span>Viewport Height</span><input name="browser_viewport_height" type="number" min="320" value="${escapeHtml(browser.viewport_height || 900)}" ${canWrite ? "" : "disabled"} /></label>
                </div>
              </div>

              <div class="guide-card">
                <h4>2. Test The Browser Target</h4>
                <p class="subtle">Run the page in place so the right-side console can show timing, step results, console noise, page errors, and the captured network log.</p>
                <div class="button-row">
                  ${canWrite ? `<button type="button" id="test-browser-monitor-btn">Test Browser Monitor</button>` : ""}
                </div>
                <p class="form-status" id="browser-monitor-form-status"></p>
              </div>

              <div class="guide-card ${activeResult ? "" : "builder-locked"}">
                <h4>3. Define Assertions</h4>
                <p class="subtle">${activeResult ? "Tune the browser assertions using the test diagnostics on the right." : "Run a browser test first so you can validate the journey against a real page result instead of guessing."}</p>
                <label><span>Expected Title Contains</span><input name="browser_expected_title_contains" value="${escapeHtml(browser.expected_title_contains || "")}" placeholder="Home | Example" ${canWrite ? "" : "disabled"} /></label>
                <label><span>Required Selectors</span><input name="browser_required_selectors" value="${escapeHtml(csv(browser.required_selectors || []))}" placeholder="#app, nav a.login, footer" ${canWrite ? "" : "disabled"} /></label>
                <label class="checkbox-field"><input name="browser_persist_auth_session" type="checkbox" ${browser.persist_auth_session ? "checked" : ""} ${canWrite ? "" : "disabled"} /><span>Reuse a captured authenticated browser session during scheduled runs</span></label>
                <div class="guide-card compact-card session-state-card">
                  <h4>Stored Browser Session</h4>
                  <p>${browser.has_storage_state ? "A recorded browser session is stored for this monitor." : "No recorded browser session is stored yet."}</p>
                  <div class="status-meta">
                    <span>${browser.persist_auth_session ? "Session replay enabled" : "Session replay disabled"}</span>
                    <span>${browser.storage_state_captured_at ? `Captured ${fmtTime(browser.storage_state_captured_at)}` : "No capture timestamp"}</span>
                  </div>
                </div>
                ${!isNew ? `
                  <label><span>Manual Browser Session Update</span><textarea name="browser_storage_state" rows="8" placeholder='Paste Playwright storage_state JSON here if you need to update the authenticated browser session manually.' ${canWrite ? "" : "disabled"}></textarea></label>
                  <div class="button-row ${canWrite ? "" : "hidden"}">
                    <button type="button" class="secondary" id="update-browser-session-btn">Update Stored Session</button>
                    <button type="button" class="ghost danger" id="clear-browser-session-btn">Clear Stored Session</button>
                  </div>
                  <p class="form-note">Use this to rotate the stored authenticated browser session without rebuilding the monitor.</p>
                  <p class="form-status" id="browser-session-status"></p>
                ` : ""}
              </div>

              <div class="guide-card">
                <h4>4. Define The Browser Journey</h4>
                <p class="subtle">Add the browser steps you want to validate. The recorded and manual steps are replayed in this order every time the monitor runs.</p>
                <div class="button-row ${canWrite ? "" : "hidden"}">
                  <button type="button" id="add-browser-step-btn">Add Step</button>
                </div>
                <div class="stack" id="browser-steps-list">
                  ${(steps.length ? steps : [{ name: "Wait for main app", action: "wait_for_selector", selector: "body" }]).map((step, index) => browserStepRowMarkup(step, index)).join("")}
                </div>
              </div>

              <div class="guide-card">
                <h4>5. Define Scheduling And Alert Conditions</h4>
                <div class="guide-grid">
                  <label><span>Interval Seconds</span><input name="interval_seconds" type="number" min="1" value="${escapeHtml(check.interval_seconds || 300)}" ${canWrite ? "" : "disabled"} /></label>
                  <label>
                    <span>Placement</span>
                    <select name="placement_mode" ${canWrite ? "" : "disabled"}>
                      <option value="auto" ${placementMode !== "specific" ? "selected" : ""}>Auto-select the healthiest least-loaded container</option>
                      <option value="specific" ${placementMode === "specific" ? "selected" : ""}>Choose a specific monitoring container</option>
                    </select>
                  </label>
                  <label class="field-assigned-node ${placementMode === "specific" ? "" : "hidden"}"><span>Monitoring Container</span><select name="assigned_node_id" ${canWrite ? "" : "disabled"}><option value="">Select a monitoring container</option>${nodes.map((node) => `<option value="${escapeHtml(node.node_id)}" ${selectedNodeId === node.node_id ? "selected" : ""}>${escapeHtml(node.label)}${node.healthy ? " | healthy" : " | unhealthy"} | ${escapeHtml(node.description || "")}</option>`).join("")}</select></label>
                </div>
                ${alertThresholdFieldsMarkup(check, canWrite)}
              </div>

              <div class="guide-card">
                <h4>6. Configure The Monitor</h4>
                <div class="guide-grid">
                  <label><span>Name</span><input name="name" value="${escapeHtml(check.name || "")}" required ${canWrite ? "" : "disabled"} /></label>
                  <label><span>Enabled</span><select name="enabled" ${canWrite ? "" : "disabled"}><option value="true" ${check.enabled !== false ? "selected" : ""}>Enabled</option><option value="false" ${check.enabled === false ? "selected" : ""}>Disabled</option></select></label>
                </div>
              </div>
            </div>

            <div class="button-row monitor-builder-actions">
              ${isNew ? `<button type="button" class="secondary" id="abandon-browser-builder-btn">Abandon</button>` : ""}
              ${canWrite ? `<button type="submit">${isNew ? "Create Browser Monitor" : "Save Browser Monitor"}</button>` : ""}
              ${!isNew && canWrite ? `<button type="button" class="secondary" id="toggle-browser-monitor-btn">${check.enabled === false ? "Enable Monitor" : "Disable Monitor"}</button>` : ""}
              ${!isNew && canWrite ? `<button type="button" class="danger" id="delete-browser-monitor-btn">Delete Monitor</button>` : ""}
            </div>
          </section>
        </form>
      </section>
      ${browserMonitorBuilderPreviewMarkup(activeResult)}
    </div>
  `;
}

function realUserMonitoringBuilderMarkup() {
  return `
    <div class="monitor-builder-layout">
      <section class="stack">
        <section class="panel">
          <div class="panel-head">
            <h3>Real User Monitoring Builder</h3>
            <p>Use the same guided builder pattern to define how real user telemetry should eventually be captured, evaluated, and surfaced in the dashboards.</p>
          </div>
          <div class="stack">
            <div class="guide-card">
              <h4>1. Define The Experience Scope</h4>
              <p class="subtle">Choose the application, routes, and user journeys you want to observe. This section will become the place where you define page groups, flows, and business-critical entry points.</p>
            </div>
            <div class="guide-card">
              <h4>2. Define The Data Collection Model</h4>
              <p class="subtle">This workflow is reserved for browser beacons, page timing, resource timing, and user-session context that represent how the application behaves for real users.</p>
            </div>
            <div class="guide-card">
              <h4>3. Define Assertions And Experience Goals</h4>
              <p class="subtle">Use this space for future thresholds like acceptable page responsiveness, error counts, and user-impacting regressions.</p>
            </div>
            <div class="guide-card">
              <h4>4. Define Scheduling And Alert Conditions</h4>
              <p class="subtle">Real user monitoring will eventually tie into alerting, retention, and SLO-style dashboarding the same way the other monitor types do.</p>
            </div>
            <div class="guide-card">
              <h4>5. Configure The Monitor</h4>
              <p class="subtle">This page is now framed like the other builders so the eventual feature can slot in without changing the user story again.</p>
            </div>
          </div>
          <div class="button-row monitor-builder-actions">
            <button type="button" class="secondary" id="abandon-rum-builder-btn">Abandon</button>
            <button type="button" disabled>Coming Soon</button>
          </div>
        </section>
      </section>
      <aside class="panel monitor-builder-preview">
        <div class="panel-head">
          <h3>Live Preview</h3>
          <p>This panel is reserved for future session metrics, waterfall timing, JavaScript error samples, and user experience diagnostics.</p>
        </div>
        <div class="guide-card">
          <h4>Planned Output</h4>
          <p>Real user monitoring will eventually render golden signals, route performance, user-session latency, page errors, and trend-based assertions here just like the other builders.</p>
        </div>
      </aside>
    </div>
  `;
}

function recorderBuilderPreviewMarkup() {
  const result = state.recorder.lastTestResult || null;
  return `
    <aside class="panel monitor-builder-preview" id="recorder-builder-preview">
      <div class="panel-head">
        <h3>Live Test Console</h3>
        <p>${result ? "Current recorder session details plus the latest synthetic replay diagnostics." : "As you record, this panel summarizes the session. Once you test the generated monitor, the browser diagnostics will appear here too."}</p>
      </div>
      <div class="builder-preview-stack">
        <div class="guide-card compact-card">
          <h4>Recorder Session</h4>
          <p>${escapeHtml(state.recorder.mode === "playwright" ? (state.recorder.playwrightSessionId || "Not started") : (state.recorder.sessionId || "Not started"))}</p>
          <div class="status-meta">
            <span>${escapeHtml(state.recorder.mode === "playwright" ? "Chromium Recorder" : "Embedded Recorder")}</span>
            <span>${state.recorder.steps.length} recorded step${state.recorder.steps.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="guide-card compact-card">
          <h4>Current Target</h4>
          <p>${escapeHtml(state.recorder.lastPageUrl || state.recorder.targetUrl || "No page loaded")}</p>
          <div class="status-meta">
            <span>${escapeHtml(state.recorder.playwrightError || state.recorder.playwrightStatus || state.recorder.status || "Recorder waiting for input")}</span>
          </div>
        </div>
        ${
          result
            ? browserDiagnosticsMarkup(result, { compact: true })
            : `
              <div class="guide-card">
                <h4>No Test Yet</h4>
                <p>Start recording, build a journey, and then run <strong>Test Recorded Monitor</strong> to populate the replay diagnostics here.</p>
              </div>
            `
        }
      </div>
    </aside>
  `;
}

function monitorFormMarkup(check, mode, cluster = { node_id: "monitor-1", peers: [], healthy_nodes: [] }) {
  const auth = check.auth || {};
  const authType = auth.type || (check.type === "auth" ? "bearer" : "none");
  const requestLike = ["http", "auth", "api"].includes(check.type);
  const isNew = mode === "create";
  const canWrite = hasRole("read_write");
  const managed = Boolean(check.generated);
  const editable = canWrite && !managed;
  const readonlyAttr = editable ? "" : "disabled";
  const placementMode = check.placement_mode || "auto";
  const nodes = assignableNodeOptions(cluster);
  const selectedNodeId = check.assigned_node_id || "";
  return `
    <div class="stack">
      ${isNew ? "" : `
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
            <h4>Placement</h4>
            <p>${check.placement_mode === "specific" ? `Pinned to ${escapeHtml(check.assigned_node_id || check.owner || "monitor-1")}` : "Automatic cluster placement"}</p>
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
      </section>`}

      <section class="panel">
        <div class="panel-head">
          <h3>${isNew ? "Add Monitor" : `Edit ${escapeHtml(check.name)}`}</h3>
          <p>${isNew ? "Create a new endpoint monitor." : managed ? "This monitor is generated from service configuration and is read-only here." : "Save changes and the monitor will re-run immediately."}</p>
        </div>
        <form class="check-form" id="monitor-form" data-original-name="${escapeHtml(check.name || "")}" data-original-id="${escapeHtml(check.id || "")}">
          <div class="accordion">
            <details class="accordion-item" ${isNew ? "" : "open"}>
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
                    <option value="api" ${check.type === "api" ? "selected" : ""}>API</option>
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

            <details class="accordion-item" ${isNew ? "" : "open"}>
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
                <label class="field-url ${requestLike ? "" : "hidden"}"><span>URL</span><input name="url" value="${escapeHtml(check.url || "")}" ${readonlyAttr} /></label>
                <label class="field-host ${["dns", "database", "generic"].includes(check.type) ? "" : "hidden"}"><span>Host</span><input name="host" value="${escapeHtml(check.host || "")}" ${readonlyAttr} /></label>
                <label class="field-port ${requestLike || ["database", "generic"].includes(check.type) ? "" : "hidden"}"><span>Port</span><input name="port" type="number" min="1" max="65535" value="${escapeHtml(check.port || "")}" ${readonlyAttr} /></label>
                <label class="request-like-only ${requestLike ? "" : "hidden"}"><span>Method</span><select name="request_method" ${readonlyAttr}>${["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => `<option value="${method}" ${check.request_method === method ? "selected" : ""}>${method}</option>`).join("")}</select></label>
                <label class="request-like-only ${requestLike ? "" : "hidden"}"><span>Request Body Mode</span><select name="request_body_mode" ${readonlyAttr}><option value="none" ${(check.request_body_mode || "none") === "none" ? "selected" : ""}>No Body</option><option value="json" ${check.request_body_mode === "json" ? "selected" : ""}>JSON</option><option value="text" ${check.request_body_mode === "text" ? "selected" : ""}>Text</option></select></label>
                <label class="request-like-only ${requestLike ? "" : "hidden"}"><span>Request Headers</span><textarea name="request_headers_text" rows="4" ${readonlyAttr}>${escapeHtml(formatHeaderLines(check.request_headers || []))}</textarea></label>
                <label class="builder-request-body ${requestLike && (check.request_body_mode || "none") !== "none" ? "" : "hidden"}"><span>Request Body</span><textarea name="request_body" rows="6" ${readonlyAttr}>${escapeHtml(check.request_body || "")}</textarea></label>
              </div>
            </details>

            <details class="accordion-item" ${isNew ? "" : "open"}>
              <summary class="accordion-summary">
                <div>
                  <strong>Monitor Placement</strong>
                  <div class="status-meta">
                    <span>Choose a specific monitoring container or let the service auto-place it</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body">
                <label>
                  <span>Placement</span>
                  <select name="placement_mode" ${readonlyAttr}>
                    <option value="auto" ${placementMode !== "specific" ? "selected" : ""}>Auto-select the healthiest least-loaded container</option>
                    <option value="specific" ${placementMode === "specific" ? "selected" : ""}>Choose a specific monitoring container</option>
                  </select>
                </label>
                <label class="field-assigned-node ${placementMode === "specific" ? "" : "hidden"}">
                  <span>Monitoring Container</span>
                  <select name="assigned_node_id" ${readonlyAttr}>
                    <option value="">Select a monitoring container</option>
                    ${nodes
                      .map(
                        (node) => `<option value="${escapeHtml(node.node_id)}" ${selectedNodeId === node.node_id ? "selected" : ""}>${escapeHtml(node.label)}${node.healthy ? " | healthy" : " | unhealthy"} | ${escapeHtml(node.description || "")}</option>`
                      )
                      .join("")}
                  </select>
                </label>
                <div class="guide-card">
                  <h4>Placement Notes</h4>
                  <p>${nodes.length ? "Auto placement keeps new endpoint checks on healthy full-monitoring nodes and balances them across the cluster." : "No full-monitoring peer nodes are currently available, so this monitor will stay on the local node."}</p>
                </div>
              </div>
            </details>

            <details class="accordion-item ${requestLike ? "validation-open" : ""}" ${!isNew && requestLike ? "open" : ""}>
              <summary class="accordion-summary field-statuses ${requestLike ? "" : "hidden"}">
                <div>
                  <strong>Validation Rules</strong>
                  <div class="status-meta">
                    <span>Status codes and content assertions</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body field-statuses ${requestLike ? "" : "hidden"}">
                <label class="field-statuses ${requestLike ? "" : "hidden"}"><span>Expected Statuses</span><input name="expected_statuses" value="${escapeHtml(csv(check.expected_statuses || [200]))}" ${readonlyAttr} /></label>
                <label class="request-like-only ${requestLike ? "" : "hidden"}"><span>Expected Response Headers</span><textarea name="expected_headers_text" rows="4" ${readonlyAttr}>${escapeHtml(formatHeaderLines(check.expected_headers || [], true))}</textarea></label>
                <label class="request-like-only ${requestLike ? "" : "hidden"}"><span>Max Response Time (ms)</span><input name="max_response_time_ms" type="number" min="1" value="${escapeHtml(check.max_response_time_ms || "")}" ${readonlyAttr} /></label>
                <label class="field-content ${requestLike ? "" : "hidden"}"><span>Contains Text</span><input name="contains" value="${escapeHtml(csv(check.content_rules?.contains || []))}" ${readonlyAttr} /></label>
                <label class="field-content ${requestLike ? "" : "hidden"}"><span>Exclude Text</span><input name="not_contains" value="${escapeHtml(csv(check.content_rules?.not_contains || []))}" ${readonlyAttr} /></label>
                <label class="field-content ${requestLike ? "" : "hidden"}"><span>Regex</span><input name="regex" value="${escapeHtml(check.content_rules?.regex || "")}" ${readonlyAttr} /></label>
              </div>
            </details>

            <details class="accordion-item auth-only ${!requestLike ? "hidden" : ""}" ${!isNew && requestLike ? "open" : ""}>
              <summary class="accordion-summary auth-only ${!requestLike ? "hidden" : ""}">
                <div>
                  <strong>Authentication</strong>
                  <div class="status-meta">
                    <span>Credentials and auth headers for protected HTTP endpoints</span>
                  </div>
                </div>
              </summary>
              <div class="accordion-body auth-only ${!["http", "auth"].includes(check.type) ? "hidden" : ""}">
                <label class="auth-only ${!["http", "auth"].includes(check.type) ? "hidden" : ""}" data-auth-field="type">
                  <span>Auth Type</span>
                  <select name="auth_type" ${readonlyAttr}>
                    <option value="none" ${authType === "none" ? "selected" : ""}>None</option>
                    <option value="bearer" ${authType === "bearer" ? "selected" : ""}>Bearer</option>
                    <option value="basic" ${authType === "basic" ? "selected" : ""}>Basic</option>
                    <option value="header" ${authType === "header" ? "selected" : ""}>Header</option>
                  </select>
                </label>
                <label class="auth-only ${!["http", "auth"].includes(check.type) || authType !== "bearer" ? "hidden" : ""}" data-auth-field="token"><span>Bearer Token</span><input name="token" value="${escapeHtml(auth.token || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${!["http", "auth"].includes(check.type) || authType !== "basic" ? "hidden" : ""}" data-auth-field="username"><span>Username</span><input name="username" value="${escapeHtml(auth.username || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${!["http", "auth"].includes(check.type) || authType !== "basic" ? "hidden" : ""}" data-auth-field="password"><span>Password</span><input name="password" type="password" value="${escapeHtml(auth.password || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${!["http", "auth"].includes(check.type) || authType !== "header" ? "hidden" : ""}" data-auth-field="header_name"><span>Header Name</span><input name="header_name" value="${escapeHtml(auth.header_name || "")}" ${readonlyAttr} /></label>
                <label class="auth-only ${!["http", "auth"].includes(check.type) || authType !== "header" ? "hidden" : ""}" data-auth-field="header_value"><span>Header Value</span><input name="header_value" value="${escapeHtml(auth.header_value || "")}" ${readonlyAttr} /></label>
                <div class="button-row ${editable ? "" : "hidden"}">
                  <button type="button" class="secondary" id="test-auth-btn">Test Auth</button>
                </div>
                <p class="form-status" id="test-auth-status"></p>
              </div>
            </details>

            <details class="accordion-item database-only ${check.type !== "database" ? "hidden" : ""}" ${!isNew && check.type === "database" ? "open" : ""}>
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
                    <option value="postgresql" ${(check.database_engine || "mysql") === "postgresql" ? "selected" : ""}>PostgreSQL</option>
                  </select>
                </label>
                <label class="database-only ${check.type !== "database" ? "hidden" : ""}"><span>Database Username</span><input name="database_username" value="${escapeHtml(auth.username || "")}" ${readonlyAttr} /></label>
                <label class="database-only ${check.type !== "database" ? "hidden" : ""}"><span>Database Password</span><input name="database_password" type="password" value="${escapeHtml(auth.password || "")}" ${readonlyAttr} /></label>
              </div>
            </details>

            ${alertThresholdFieldsMarkup(check, editable)}
          </div>
          <div class="button-row ${editable ? "" : "hidden"}">
            <button type="button" class="secondary" id="test-monitor-btn">Test Monitor</button>
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
    </div>
  `;
}

function browserStepRowMarkup(step = {}, index = 0) {
  const action = step.action || "wait_for_selector";
  const title = step.name || `Step ${index + 1}`;
  const selectorSummary = step.selector || "No selector";
  const valueSummary = step.value || "No value";
  return `
    <details class="browser-step-row" data-browser-step>
      <summary class="accordion-summary browser-step-summary">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="status-meta">
            <span>${escapeHtml(browserStepActionLabel(action))}</span>
            <span>${escapeHtml(selectorSummary)}</span>
            <span>${escapeHtml(String(valueSummary).slice(0, 48))}</span>
          </div>
        </div>
      </summary>
      <div class="accordion-body">
        <label><span>Step Name</span><input name="browser_step_name" value="${escapeHtml(title)}" /></label>
        <label>
          <span>Action</span>
          <select name="browser_step_action">
            <option value="wait_for_selector" ${action === "wait_for_selector" ? "selected" : ""}>Wait For Selector</option>
            <option value="click" ${action === "click" ? "selected" : ""}>Click</option>
            <option value="fill" ${action === "fill" ? "selected" : ""}>Fill</option>
            <option value="press" ${action === "press" ? "selected" : ""}>Press Key</option>
            <option value="assert_text" ${action === "assert_text" ? "selected" : ""}>Assert Text</option>
            <option value="assert_url_contains" ${action === "assert_url_contains" ? "selected" : ""}>Assert URL Contains</option>
            <option value="wait_for_timeout" ${action === "wait_for_timeout" ? "selected" : ""}>Wait For Timeout</option>
            <option value="navigate" ${action === "navigate" ? "selected" : ""}>Navigate</option>
          </select>
        </label>
        <label class="browser-step-selector ${["wait_for_selector", "click", "fill", "assert_text"].includes(action) ? "" : "hidden"}">
          <span>Selector</span>
          <input name="browser_step_selector" value="${escapeHtml(step.selector || "")}" placeholder="#app .login-button" />
        </label>
        <label class="browser-step-value ${["fill", "press", "assert_text", "assert_url_contains", "wait_for_timeout", "navigate"].includes(action) ? "" : "hidden"}">
          <span>Value</span>
          <input name="browser_step_value" value="${escapeHtml(step.value || "")}" placeholder="Text, key, URL fragment, or timeout ms" />
        </label>
        <label>
          <span>Timeout Seconds</span>
          <input name="browser_step_timeout_seconds" type="number" min="1" value="${escapeHtml(step.timeout_seconds || "")}" />
        </label>
        <div class="button-row">
          <button type="button" class="secondary" data-remove-browser-step="true">Remove Step</button>
        </div>
      </div>
    </details>
  `;
}

function browserStepActionLabel(action) {
  const labels = {
    wait_for_selector: "Wait For Selector",
    click: "Click",
    fill: "Fill",
    press: "Press Key",
    assert_text: "Assert Text",
    assert_url_contains: "Assert URL Contains",
    wait_for_timeout: "Wait For Timeout",
    navigate: "Navigate",
  };
  return labels[action] || action;
}

function networkCellValue(value) {
  return String(value ?? "").trim();
}

function networkRowMarkup(entry) {
  const method = networkCellValue(entry.method);
  const status = networkCellValue(entry.status ?? (entry.ok === false ? "failed" : "pending"));
  const type = networkCellValue(entry.resource_type);
  const duration = networkCellValue(formatDuration(entry.duration_ms));
  const durationRaw = entry.duration_ms == null ? "" : String(entry.duration_ms);
  const failure = networkCellValue(entry.failure);
  const url = networkCellValue(entry.url);
  return `
    <tr
      class="${entry.failure || entry.ok === false ? "network-row-failed" : ""}"
      data-method="${escapeHtml(method.toLowerCase())}"
      data-status="${escapeHtml(status.toLowerCase())}"
      data-type="${escapeHtml(type.toLowerCase())}"
      data-duration="${escapeHtml(durationRaw)}"
      data-failure="${escapeHtml(failure.toLowerCase())}"
      data-url="${escapeHtml(url.toLowerCase())}"
    >
      <td>${escapeHtml(method)}</td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(type)}</td>
      <td>${escapeHtml(duration)}</td>
      <td>${escapeHtml(failure)}</td>
      <td class="mono network-url-cell" title="${escapeHtml(url)}">${escapeHtml(url)}</td>
    </tr>
  `;
}

function networkFilterOptionMarkup(value) {
  return `<option value="${escapeHtml(String(value))}">${escapeHtml(String(value))}</option>`;
}

function networkFilterToolbarMarkup(network = []) {
  const methods = [...new Set(network.map((entry) => networkCellValue(entry.method)).filter(Boolean))].sort();
  const statuses = [
    ...new Set(
      network
        .map((entry) => networkCellValue(entry.status ?? (entry.ok === false ? "failed" : "pending")))
        .filter(Boolean)
    ),
  ].sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
  const types = [...new Set(network.map((entry) => networkCellValue(entry.resource_type)).filter(Boolean))].sort();
  return `
    <div class="network-filter-grid">
      <label>
        <span>Method</span>
        <select data-network-filter="method">
          <option value="">All Methods</option>
          ${methods.map((value) => networkFilterOptionMarkup(value)).join("")}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select data-network-filter="status">
          <option value="">All Statuses</option>
          ${statuses.map((value) => networkFilterOptionMarkup(value)).join("")}
        </select>
      </label>
      <label>
        <span>Type</span>
        <select data-network-filter="type">
          <option value="">All Types</option>
          ${types.map((value) => networkFilterOptionMarkup(value)).join("")}
        </select>
      </label>
      <label><span>Min Duration (ms)</span><input type="number" min="0" data-network-filter-min="duration" placeholder="0" /></label>
      <label><span>Max Duration (ms)</span><input type="number" min="0" data-network-filter-max="duration" placeholder="5000" /></label>
      <label><span>Failure</span><input type="text" data-network-filter="failure" placeholder="timeout" /></label>
      <label><span>URL</span><input type="text" data-network-filter="url" placeholder="api or /login" /></label>
    </div>
    <div class="network-filter-meta">
      <span id="network-filter-count"></span>
      <button type="button" class="secondary" id="clear-network-filters-btn">Clear Filters</button>
    </div>
  `;
}

function summaryRowsMarkup(rows = []) {
  return `
    <div class="dashboard-summary-list">
      ${rows.map((row) => `
        <div class="dashboard-summary-row">
          <span>${escapeHtml(row.label)}</span>
          <span>${row.html ?? escapeHtml(row.value ?? "n/a")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function browserDiagnosticsMarkup(result, options = {}) {
  const compact = Boolean(options.compact);
  const details = result.details || {};
  const perf = details.performance || {};
  const steps = Array.isArray(details.steps) ? details.steps : [];
  const network = Array.isArray(details.network) ? details.network : [];
  const consoleMessages = Array.isArray(details.console) ? details.console : [];
  const pageErrors = Array.isArray(details.page_errors) ? details.page_errors : [];
  const failedNetwork = network.filter((entry) => entry.failure || entry.ok === false);
  return `
    <div class="stack">
      <div class="${compact ? "stack" : "split-panels"}">
        <section class="panel">
          <div class="panel-head">
            <h3>${compact ? "Browser Performance" : "Test Outcome"}</h3>
            <p>${compact ? "Page timing, final destination, and overall browser session state." : "Latest browser run summary and page timing."}</p>
          </div>
          ${summaryRowsMarkup([
            { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
            { label: "Message", value: result.message || "No message" },
            { label: "Duration", value: formatDuration(result.duration_ms) },
            { label: "Final URL", html: `<span class="mono">${escapeHtml(details.final_url || "n/a")}</span>` },
            { label: "Title", value: details.title || "n/a" },
            { label: "DOMContentLoaded", value: formatDuration(perf.domContentLoadedMs) },
            { label: "Load Event", value: formatDuration(perf.loadMs) },
            { label: "Resource Count", value: perf.resourceCount ?? 0 },
          ])}
        </section>
        <section class="panel">
          <div class="panel-head">
            <h3>Step Status</h3>
            <p>Each browser action and assertion from the monitor journey.</p>
          </div>
          <div class="stack">
            ${steps.length ? steps.map((step) => `
              <div class="status-row compact">
                <span class="dot ${statusClass(step.success ? "healthy" : "unhealthy")}"></span>
                <div>
                  <strong>${escapeHtml(step.name || step.action || "Step")}</strong>
                  <div class="status-meta">
                    <span>${escapeHtml(step.action || "step")}</span>
                    <span>${formatDuration(step.duration_ms)}</span>
                  </div>
                </div>
                <span class="subtle">${escapeHtml(step.message || "")}</span>
              </div>
            `).join("") : `<div class="guide-card"><p>No scripted steps were defined. The browser test only ran navigation and built-in assertions.</p></div>`}
          </div>
        </section>
      </div>

      <section class="panel browser-session-panel">
        <div class="panel-head">
          <h3>Browser Diagnostics</h3>
          <p>Network traffic, console output, and page errors captured during this run.</p>
        </div>
        <div class="browser-diagnostic-summary">
          <div class="guide-card compact-card">
            <h4>Requests</h4>
            <p>${network.length}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Failed Requests</h4>
            <p>${failedNetwork.length}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Console Messages</h4>
            <p>${consoleMessages.length}</p>
          </div>
          <div class="guide-card compact-card">
            <h4>Page Errors</h4>
            <p>${pageErrors.length}</p>
          </div>
        </div>
        <div class="accordion browser-diagnostics-accordion">
          <details class="accordion-item">
            <summary class="accordion-summary">
              <div>
                <strong>Network Log</strong>
                <div class="status-meta">
                  <span>${network.length} requests</span>
                  <span>${failedNetwork.length} failures</span>
                </div>
              </div>
            </summary>
            <div class="accordion-body">
              ${compact ? "" : networkFilterToolbarMarkup(network)}
              <div class="table-scroll">
                <table class="status-table network-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Type</th>
                      <th>Duration</th>
                      <th>Failure</th>
                      <th>URL</th>
                    </tr>
                  </thead>
                  <tbody ${compact ? "" : `id="network-log-body"`}>
                    ${network.length ? network.map((entry) => networkRowMarkup(entry)).join("") : `<tr><td colspan="6">No network activity captured yet.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </details>

          <details class="accordion-item">
            <summary class="accordion-summary">
              <div>
                <strong>Console Messages</strong>
                <div class="status-meta">
                  <span>${consoleMessages.length} entries</span>
                </div>
              </div>
            </summary>
            <div class="accordion-body">
              <div class="stack">
                ${consoleMessages.length ? consoleMessages.map((entry) => `
                  <div class="guide-card">
                    <h4>${escapeHtml(entry.type || "log")}</h4>
                    <p>${escapeHtml(entry.text || "")}</p>
                  </div>
                `).join("") : `<div class="guide-card"><p>No console messages were captured.</p></div>`}
              </div>
            </div>
          </details>

          <details class="accordion-item">
            <summary class="accordion-summary">
              <div>
                <strong>Script And Page Errors</strong>
                <div class="status-meta">
                  <span>${pageErrors.length} entries</span>
                </div>
              </div>
            </summary>
            <div class="accordion-body">
              <div class="stack">
                ${pageErrors.length ? pageErrors.map((entry) => `
                  <div class="guide-card">
                    <h4>Page Error</h4>
                    <p>${escapeHtml(entry)}</p>
                  </div>
                `).join("") : `<div class="guide-card"><p>No page errors were captured.</p></div>`}
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  `;
}

function monitorRunBreakdownMarkup(check, result) {
  if (!result) {
    return `<div class="guide-card"><p>No run details are available yet for this monitor.</p></div>`;
  }
  const details = result.details || {};
  if (check.type === "browser") {
    return browserDiagnosticsMarkup(result, { compact: true });
  }
  if (check.type === "http") {
    return `
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h3>HTTP Performance</h3>
            <p>Status, content validation context, and timing from this monitor run.</p>
          </div>
          ${summaryRowsMarkup([
            { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
            { label: "Message", value: result.message || "No message" },
            { label: "Duration", value: formatDuration(result.duration_ms) },
            { label: "URL", html: `<span class="mono">${escapeHtml(checkTargetLabel(check))}</span>` },
            { label: "HTTP Status", value: details.status_code ?? "n/a" },
            { label: "Expected Statuses", value: csv(check.expected_statuses || []) || "n/a" },
            { label: "Contains Rules", value: csv(check.content?.contains || []) || "None" },
            { label: "Exclude Rules", value: csv(check.content?.not_contains || []) || "None" },
          ])}
        </section>
      </div>
    `;
  }
  if (check.type === "auth") {
    return `
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h3>Authentication Breakdown</h3>
            <p>Authenticated and unauthenticated status behavior for this run.</p>
          </div>
          ${summaryRowsMarkup([
            { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
            { label: "Message", value: result.message || "No message" },
            { label: "Duration", value: formatDuration(result.duration_ms) },
            { label: "Target", html: `<span class="mono">${escapeHtml(checkTargetLabel(check))}</span>` },
            { label: "Authenticated Status", value: details.authenticated_status ?? "n/a" },
            { label: "Unauthenticated Status", value: details.unauthenticated_status ?? "Not probed" },
            { label: "Expected Auth Statuses", value: csv(check.expect_authenticated_statuses || []) || "n/a" },
          ])}
        </section>
      </div>
    `;
  }
  if (check.type === "dns") {
    return `
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h3>DNS Resolution Breakdown</h3>
            <p>Resolved addresses and timing for this DNS lookup.</p>
          </div>
          ${summaryRowsMarkup([
            { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
            { label: "Message", value: result.message || "No message" },
            { label: "Duration", value: formatDuration(result.duration_ms) },
            { label: "Host", value: check.host || "n/a" },
            { label: "Resolved Addresses", value: Array.isArray(details.addresses) ? details.addresses.join(", ") : "None" },
          ])}
        </section>
      </div>
    `;
  }
  if (check.type === "database") {
    return `
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h3>Database Breakdown</h3>
            <p>Connection reachability, engine, and database target details from this run.</p>
          </div>
          ${summaryRowsMarkup([
            { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
            { label: "Message", value: result.message || "No message" },
            { label: "Duration", value: formatDuration(result.duration_ms) },
            { label: "Host", value: details.host || check.host || "n/a" },
            { label: "Port", value: details.port || check.port || "n/a" },
            { label: "Engine", value: details.database_engine || check.database_engine || "n/a" },
            { label: "Database", value: details.database_name || check.database_name || "n/a" },
          ])}
        </section>
      </div>
    `;
  }
  if (check.type === "generic") {
    return `
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <h3>Generic Connectivity Breakdown</h3>
            <p>Connectivity timing and endpoint details from this run.</p>
          </div>
          ${summaryRowsMarkup([
            { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
            { label: "Message", value: result.message || "No message" },
            { label: "Duration", value: formatDuration(result.duration_ms) },
            { label: "Host", value: details.host || check.host || "n/a" },
            { label: "Port", value: details.port || check.port || "n/a" },
          ])}
        </section>
      </div>
    `;
  }
  return `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>Run Breakdown</h3>
          <p>Latest monitor output and run timing.</p>
        </div>
        ${summaryRowsMarkup([
          { label: "Status", html: statusPill(result.success ? "healthy" : "unhealthy") },
          { label: "Message", value: result.message || "No message" },
          { label: "Duration", value: formatDuration(result.duration_ms) },
        ])}
      </section>
    </div>
  `;
}

function recentRunDiagnosticsMarkup(check, results = []) {
  if (!results.length) {
    return `
      <section class="panel">
        <div class="panel-head">
          <h3>Run Diagnostics</h3>
          <p>Monitor-specific output from recent runs will appear here.</p>
        </div>
        <div class="guide-card"><p>No run diagnostics are available in the selected time range yet.</p></div>
      </section>
    `;
  }
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Run Diagnostics</h3>
        <p>Monitor-specific output for recent runs in this dashboard window.</p>
      </div>
      <div class="accordion">
        ${results.slice(0, 5).map((result) => `
          <details class="accordion-item" data-run-diagnostic-key="${escapeHtml(runDiagnosticKey(check, result))}" ${state.dashboardRunDiagnostics[runDiagnosticKey(check, result)] ? "open" : ""}>
            <summary class="accordion-summary">
              <div>
                <strong>${escapeHtml(result.message || "Run result")}</strong>
                <div class="status-meta">
                  <span>${fmtTime(result.timestamp)}</span>
                  <span>${formatDuration(result.duration_ms)}</span>
                  <span>${escapeHtml(result.owner || check.owner || "monitor-1")}</span>
                </div>
              </div>
              ${statusPill(result.success ? "healthy" : "unhealthy")}
            </summary>
            <div class="accordion-body">
              ${check.type === "browser" ? `
                <div class="button-row" style="margin-bottom: 10px;">
                  <button type="button" class="secondary" data-download-har="${escapeHtml(runDiagnosticKey(check, result))}">Download HAR</button>
                </div>
              ` : ""}
              ${monitorRunBreakdownMarkup(check, result)}
            </div>
          </details>
        `).join("")}
      </div>
    </section>
  `;
}

function browserTestResultsMarkup(result) {
  if (!result) {
    return `
      <div class="guide-card">
        <h4>No Test Results Yet</h4>
        <p>Run a browser health test to see navigation timing, step outcomes, script issues, and a live network breakdown.</p>
      </div>
    `;
  }
  const details = result.details || {};
  return browserDiagnosticsMarkup(result, { compact: false });
}

function browserMonitorMarkup(check, mode, cluster = { node_id: "monitor-1", peers: [], healthy_nodes: [] }) {
  const isNew = mode === "create";
  const canWrite = hasRole("read_write");
  const placementMode = check.placement_mode || "auto";
  const nodes = assignableNodeOptions(cluster);
  const selectedNodeId = check.assigned_node_id || "";
  const browser = check.browser || {};
  const steps = Array.isArray(browser.steps) && browser.steps.length ? browser.steps : [];
  return `
    <div class="stack">
      ${isNew ? "" : `
        <section class="panel">
          <div class="panel-head">
            <h3>Monitor Status</h3>
            <p>Latest browser monitor outcome, ownership, and page health state.</p>
          </div>
          <div class="status-row">
            <span class="dot ${statusClass(check.status)}"></span>
            <div>
              <strong>${escapeHtml(check.name || "Browser monitor")}</strong>
              <div class="status-meta">
                <span>Browser</span>
                <span>${escapeHtml(check.url || "")}</span>
              </div>
            </div>
            <div>${sparklineMarkup(check.metric_points || [], check.status === "unhealthy" ? "bad" : "good")}</div>
            ${statusPill(check.status || "unknown")}
            <span class="subtle">${escapeHtml(check.latest_result?.message || "No result yet")}</span>
          </div>
        </section>
      `}
      <section class="panel">
        <div class="panel-head">
          <h3>${isNew ? "Browser Health Monitor" : `Edit ${escapeHtml(check.name)}`}</h3>
          <p>Build a synthetic browser journey, validate every step, and inspect the request log from the same page.</p>
        </div>
        <form class="check-form" id="browser-monitor-form" data-original-name="${escapeHtml(check.name || "")}" data-original-id="${escapeHtml(check.id || "")}">
          <div class="accordion">
            <details class="accordion-item" ${isNew ? "" : "open"}>
              <summary class="accordion-summary"><div><strong>Basics</strong><div class="status-meta"><span>Name, schedule, and monitor state</span></div></div></summary>
              <div class="accordion-body">
                <label><span>Name</span><input name="name" value="${escapeHtml(check.name || "")}" required ${canWrite ? "" : "disabled"} /></label>
                <label><span>Enabled</span><select name="enabled" ${canWrite ? "" : "disabled"}><option value="true" ${check.enabled !== false ? "selected" : ""}>Enabled</option><option value="false" ${check.enabled === false ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Interval Seconds</span><input name="interval_seconds" type="number" min="1" value="${escapeHtml(check.interval_seconds || 300)}" ${canWrite ? "" : "disabled"} /></label>
                <label><span>Timeout Seconds</span><input name="timeout_seconds" type="number" min="1" value="${escapeHtml(check.timeout_seconds || 30)}" ${canWrite ? "" : "disabled"} /></label>
              </div>
            </details>

            <details class="accordion-item" ${isNew ? "" : "open"}>
              <summary class="accordion-summary"><div><strong>Browser Target</strong><div class="status-meta"><span>Page URL and browser runtime settings</span></div></div></summary>
              <div class="accordion-body">
                <label><span>Page URL</span><input name="url" value="${escapeHtml(check.url || "")}" placeholder="https://example.com" required ${canWrite ? "" : "disabled"} /></label>
                <label><span>Port</span><input name="port" type="number" min="1" max="65535" value="${escapeHtml(check.port || "")}" placeholder="Optional" ${canWrite ? "" : "disabled"} /></label>
                <label><span>Wait Until</span><select name="browser_wait_until" ${canWrite ? "" : "disabled"}><option value="networkidle" ${browser.wait_until === "networkidle" || !browser.wait_until ? "selected" : ""}>Network Idle</option><option value="load" ${browser.wait_until === "load" ? "selected" : ""}>Load</option><option value="domcontentloaded" ${browser.wait_until === "domcontentloaded" ? "selected" : ""}>DOMContentLoaded</option></select></label>
                <label><span>Viewport Width</span><input name="browser_viewport_width" type="number" min="320" value="${escapeHtml(browser.viewport_width || 1440)}" ${canWrite ? "" : "disabled"} /></label>
                <label><span>Viewport Height</span><input name="browser_viewport_height" type="number" min="320" value="${escapeHtml(browser.viewport_height || 900)}" ${canWrite ? "" : "disabled"} /></label>
                <label class="checkbox-field"><input name="browser_persist_auth_session" type="checkbox" ${browser.persist_auth_session ? "checked" : ""} ${canWrite ? "" : "disabled"} /><span>Reuse a captured authenticated browser session during scheduled runs</span></label>
                <div class="guide-card compact-card session-state-card">
                  <h4>Stored Browser Session</h4>
                  <p>${browser.has_storage_state ? "A recorded browser session is stored for this monitor." : "No recorded browser session is stored yet."}</p>
                  <div class="status-meta">
                    <span>${browser.persist_auth_session ? "Session replay enabled" : "Session replay disabled"}</span>
                    <span>${browser.storage_state_captured_at ? `Captured ${fmtTime(browser.storage_state_captured_at)}` : "No capture timestamp"}</span>
                  </div>
                </div>
                ${!isNew ? `
                  <label><span>Manual Browser Session Update</span><textarea name="browser_storage_state" rows="8" placeholder='Paste Playwright storage_state JSON here if you need to update the authenticated browser session manually.' ${canWrite ? "" : "disabled"}></textarea></label>
                  <div class="button-row ${canWrite ? "" : "hidden"}">
                    <button type="button" class="secondary" id="update-browser-session-btn">Update Stored Session</button>
                    <button type="button" class="ghost danger" id="clear-browser-session-btn">Clear Stored Session</button>
                  </div>
                  <p class="form-note">This lets you rotate the stored authenticated browser session without recreating the monitor. Paste valid Playwright <code>storage_state</code> JSON.</p>
                  <p class="form-status" id="browser-session-status"></p>
                ` : ""}
              </div>
            </details>

            <details class="accordion-item" ${isNew ? "" : "open"}>
              <summary class="accordion-summary"><div><strong>Monitor Placement</strong><div class="status-meta"><span>Choose a monitoring node or let the service place this browser journey automatically</span></div></div></summary>
              <div class="accordion-body">
                <label><span>Placement</span><select name="placement_mode" ${canWrite ? "" : "disabled"}><option value="auto" ${placementMode !== "specific" ? "selected" : ""}>Auto-select the healthiest least-loaded container</option><option value="specific" ${placementMode === "specific" ? "selected" : ""}>Choose a specific monitoring container</option></select></label>
                <label class="field-assigned-node ${placementMode === "specific" ? "" : "hidden"}"><span>Monitoring Container</span><select name="assigned_node_id" ${canWrite ? "" : "disabled"}><option value="">Select a monitoring container</option>${nodes.map((node) => `<option value="${escapeHtml(node.node_id)}" ${selectedNodeId === node.node_id ? "selected" : ""}>${escapeHtml(node.label)}${node.healthy ? " | healthy" : " | unhealthy"} | ${escapeHtml(node.description || "")}</option>`).join("")}</select></label>
              </div>
            </details>

            <details class="accordion-item" ${isNew ? "" : "open"}>
              <summary class="accordion-summary"><div><strong>Assertions</strong><div class="status-meta"><span>Page title and required selectors that must be present</span></div></div></summary>
              <div class="accordion-body">
                <label><span>Expected Title Contains</span><input name="browser_expected_title_contains" value="${escapeHtml(browser.expected_title_contains || "")}" placeholder="Home | Example" ${canWrite ? "" : "disabled"} /></label>
                <label><span>Required Selectors</span><input name="browser_required_selectors" value="${escapeHtml(csv(browser.required_selectors || []))}" placeholder="#app, nav a.login, footer" ${canWrite ? "" : "disabled"} /></label>
              </div>
            </details>

            <details class="accordion-item" ${isNew ? "" : "open"}>
              <summary class="accordion-summary"><div><strong>Journey Steps</strong><div class="status-meta"><span>Describe each browser interaction and assertion you want to validate</span></div></div></summary>
              <div class="accordion-body">
                <div class="button-row ${canWrite ? "" : "hidden"}">
                  <button type="button" id="add-browser-step-btn">Add Step</button>
                </div>
                <div class="stack" id="browser-steps-list">
                  ${(steps.length ? steps : [{ name: "Wait for main app", action: "wait_for_selector", selector: "body" }]).map((step, index) => browserStepRowMarkup(step, index)).join("")}
                </div>
              </div>
            </details>

            ${alertThresholdFieldsMarkup(check, canWrite)}
          </div>

          <div class="button-row">
            ${canWrite ? `<button type="button" id="test-browser-monitor-btn">Test Browser Monitor</button>` : ""}
            ${canWrite ? `<button type="submit">${isNew ? "Create Browser Monitor" : "Save Browser Monitor"}</button>` : ""}
            ${!isNew && canWrite ? `<button type="button" class="secondary" id="toggle-browser-monitor-btn">${check.enabled === false ? "Enable Monitor" : "Disable Monitor"}</button>` : ""}
            ${!isNew && canWrite ? `<button type="button" class="danger" id="delete-browser-monitor-btn">Delete Monitor</button>` : ""}
          </div>
          <p class="form-status" id="browser-monitor-form-status"></p>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Browser Test Session</h3>
          <p>Run the monitor in place and inspect each step plus the live network log at the bottom.</p>
        </div>
        <div id="browser-test-results">${browserTestResultsMarkup(check.latest_result || null)}</div>
      </section>
    </div>
  `;
}

function recorderStepToBrowserStep(step, index) {
  if (step.event === "navigate" || step.event === "page_ready") {
    return {
      name: step.title ? `Navigate to ${step.title}` : `Navigate ${index + 1}`,
      action: "navigate",
      selector: null,
      value: step.url || null,
      timeout_seconds: null,
    };
  }
  if (step.event === "fill") {
    return {
      name: `Fill ${step.selector || `field ${index + 1}`}`,
      action: "fill",
      selector: step.selector || "input",
      value: step.value || "",
      timeout_seconds: null,
    };
  }
  if (step.event === "submit") {
    return {
      name: `Submit ${step.selector || `form ${index + 1}`}`,
      action: "click",
      selector: step.selector || "form button[type='submit']",
      value: null,
      timeout_seconds: null,
    };
  }
  return {
    name: `Click ${step.selector || `element ${index + 1}`}`,
    action: "click",
    selector: step.selector || "body",
    value: null,
    timeout_seconds: null,
  };
}

function recorderMonitorPayload(form) {
  const formData = new FormData(form);
  const placementMode = String(formData.get("placement_mode") || "auto");
  return {
    id: form.dataset.originalId || null,
    name: String(formData.get("name") || "Recorded Browser Monitor"),
    type: "browser",
    enabled: String(formData.get("enabled")) === "true",
    interval_seconds: Number(formData.get("interval_seconds") || 300),
    placement_mode: placementMode,
    assigned_node_id: placementMode === "specific" ? String(formData.get("assigned_node_id") || "") || null : null,
    timeout_seconds: formData.get("timeout_seconds") ? Number(formData.get("timeout_seconds")) : 30,
    url: String(formData.get("url") || state.recorder.targetUrl || "").trim() || null,
    host: null,
    port: null,
    database_name: null,
    database_engine: "postgresql",
    expected_statuses: [200],
    expect_authenticated_statuses: [200],
    auth: null,
    content: { contains: [], not_contains: [], regex: null },
    browser: {
      expected_title_contains: String(formData.get("expected_title_contains") || "").trim() || null,
      required_selectors: parseCsv(formData.get("required_selectors") || ""),
      wait_until: String(formData.get("wait_until") || "networkidle"),
      viewport_width: Number(formData.get("viewport_width") || 1440),
      viewport_height: Number(formData.get("viewport_height") || 900),
      persist_auth_session: String(formData.get("persist_auth_session")) === "true" || formData.get("persist_auth_session") === "on",
      storage_state: null,
      storage_state_captured_at: null,
      steps: state.recorder.steps.map(recorderStepToBrowserStep),
    },
  };
}

async function hydrateRecorderStorageState(payload) {
  if (!payload?.browser?.persist_auth_session) {
    payload.browser.storage_state = null;
    payload.browser.storage_state_captured_at = null;
    return payload;
  }
  const mode = state.recorder.mode === "playwright" ? "playwright" : "in_app";
  const activeSessionId = mode === "playwright" ? state.recorder.playwrightSessionId : state.recorder.sessionId;
  if (!activeSessionId || !payload.url) {
    throw new Error("Record an authenticated browser session first so it can be reused by this monitor.");
  }
  const query = new URLSearchParams({ mode, session_id: activeSessionId });
  if (mode === "in_app") {
    query.set("url", payload.url);
  }
  const sessionState = await api(`/api/recorder/storage-state?${query.toString()}`);
  if (!sessionState.available || !sessionState.storage_state) {
    throw new Error("No authenticated browser session has been captured yet. Log in through the recorder first, then save the monitor.");
  }
  payload.browser.storage_state = sessionState.storage_state;
  payload.browser.storage_state_captured_at = sessionState.captured_at || null;
  return payload;
}

function recorderStepMarkup(step, index) {
  const meta = [];
  if (step.selector) meta.push(step.selector);
  if (step.value) meta.push(String(step.value).slice(0, 60));
  if (step.url) meta.push(step.url);
  return `
    <div class="status-row compact recorder-step-row">
      <span class="dot healthy"></span>
      <div>
        <strong>${escapeHtml((step.event || "step").toUpperCase())}</strong>
        <div class="status-meta">
          <span>${escapeHtml(meta.join(" | ") || "Recorded action")}</span>
        </div>
      </div>
      <button type="button" class="ghost danger" data-remove-recorder-step="${index}">Remove</button>
    </div>
  `;
}

function recorderBlockedReason(payload = {}) {
  const haystack = [
    payload.title,
    payload.textSnippet,
    payload.message,
    payload.error,
    payload.body,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const patterns = [
    { needle: "too many requests", message: "The embedded recorder looks rate-limited by the target site." },
    { needle: "access denied", message: "The embedded recorder was denied by the target site." },
    { needle: "unusual traffic", message: "The embedded recorder appears to be blocked as automated traffic." },
    { needle: "temporarily unavailable", message: "The target site is rejecting the embedded recorder session." },
    { needle: "captcha", message: "The target site is asking for a CAPTCHA, which is a better fit for Chromium recorder." },
    { needle: "verify you are human", message: "The embedded recorder is being challenged as a bot." },
    { needle: "robot or human", message: "The embedded recorder is being challenged as a bot." },
    { needle: "request blocked", message: "The embedded recorder request was blocked by the target site." },
  ];
  const match = patterns.find((pattern) => haystack.includes(pattern.needle));
  return match ? match.message : "";
}

function stopPlaywrightRecorderPolling() {
  if (state.recorder.playwrightPollHandle) {
    window.clearInterval(state.recorder.playwrightPollHandle);
    state.recorder.playwrightPollHandle = null;
  }
}

async function teardownPlaywrightRecorder(stopRemote = false) {
  const priorSessionId = state.recorder.playwrightSessionId;
  stopPlaywrightRecorderPolling();
  if (stopRemote && priorSessionId) {
    try {
      await api(`/api/recorder/playwright-session/${encodeURIComponent(priorSessionId)}/stop`, {
        method: "POST",
      });
    } catch (_) {
      // Best-effort cleanup only.
    }
  }
  if (stopRemote && priorSessionId) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      try {
        const status = await api(`/api/recorder/playwright-session/${encodeURIComponent(priorSessionId)}`);
        if (status.status === "stopped" || status.status === "error" || !status.browser_open) {
          break;
        }
      } catch (_) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }
  state.recorder.playwrightSessionId = null;
  state.recorder.playwrightStatus = "";
  state.recorder.playwrightError = "";
  state.recorder.playwrightBrowserOpen = false;
  state.recorder.playwrightLaunchInFlight = false;
  if (state.recorder.mode === "playwright") {
    state.recorder.mode = "in_app";
  }
}

async function resetRecorderState() {
  await teardownPlaywrightRecorder(true);
  const next = createRecorderState();
  Object.assign(state.recorder, next);
}

function refreshRecorderUi() {
  const sessionLabel = document.getElementById("monitor-recorder-session-label");
  const pageLabel = document.getElementById("monitor-recorder-page-label");
  const count = document.getElementById("recorder-step-count");
  const modeValue = document.getElementById("monitor-recorder-mode-value");
  const modeHint = document.getElementById("monitor-recorder-mode-hint");
  const fallbackPanel = document.getElementById("recorder-fallback-panel");
  const fallbackText = document.getElementById("recorder-fallback-text");
  const startPlaywrightButton = document.getElementById("use-playwright-recorder-btn");
  const stopPlaywrightButton = document.getElementById("stop-playwright-recorder-btn");
  const framePanel = document.getElementById("recorder-frame-panel");
  const playwrightPanel = document.getElementById("playwright-recorder-panel");
  const playwrightStatus = document.getElementById("playwright-recorder-status");

  if (sessionLabel) {
    sessionLabel.textContent = state.recorder.mode === "playwright"
      ? (state.recorder.playwrightSessionId || "Not started")
      : (state.recorder.sessionId || "Not started");
  }
  if (pageLabel) {
    pageLabel.textContent = state.recorder.lastPageUrl || state.recorder.targetUrl || "No page loaded";
  }
  if (count) {
    count.textContent = `${state.recorder.steps.length} recorded step${state.recorder.steps.length === 1 ? "" : "s"}`;
  }
  if (modeValue) {
    modeValue.textContent = state.recorder.mode === "playwright" ? "Chromium Recorder" : "Embedded Recorder";
  }
  if (modeHint) {
    modeHint.textContent = state.recorder.mode === "playwright"
      ? (
          state.recorder.playwrightBrowserOpen
            ? "Chromium is open. Walk through the flow in that browser window and the steps will appear here."
            : (state.recorder.playwrightStatus || "Chromium recorder is starting.")
        )
      : "Using the in-app recorder frame inside the portal.";
  }
  if (fallbackPanel) {
    fallbackPanel.classList.toggle("hidden", !state.recorder.fallbackSuggested);
  }
  if (fallbackText) {
    fallbackText.textContent = state.recorder.fallbackReason || "";
  }
  if (startPlaywrightButton) {
    startPlaywrightButton.classList.toggle("hidden", state.recorder.mode === "playwright");
  }
  if (stopPlaywrightButton) {
    stopPlaywrightButton.classList.toggle("hidden", state.recorder.mode !== "playwright");
  }
  if (framePanel) {
    framePanel.classList.toggle("hidden", state.recorder.mode === "playwright");
  }
  if (playwrightPanel) {
    playwrightPanel.classList.toggle("hidden", state.recorder.mode !== "playwright");
  }
  if (playwrightStatus) {
    const message = state.recorder.playwrightError
      || state.recorder.playwrightStatus
      || "Chromium recorder not running.";
    setStatus(playwrightStatus, message, Boolean(state.recorder.playwrightError));
  }
  const preview = document.getElementById("recorder-builder-preview");
  if (preview) {
    preview.outerHTML = recorderBuilderPreviewMarkup();
  }
}

function suggestPlaywrightFallback(reason) {
  state.recorder.fallbackSuggested = true;
  state.recorder.fallbackReason = reason;
  refreshRecorderUi();
}

function clearPlaywrightFallback() {
  state.recorder.fallbackSuggested = false;
  state.recorder.fallbackReason = "";
  refreshRecorderUi();
}

async function pollPlaywrightRecorderStatus() {
  if (!state.recorder.playwrightSessionId) return;
  const status = await api(`/api/recorder/playwright-session/${encodeURIComponent(state.recorder.playwrightSessionId)}`);
  state.recorder.mode = "playwright";
  state.recorder.playwrightStatus = status.status || "";
  state.recorder.playwrightError = status.error || "";
  state.recorder.playwrightBrowserOpen = Boolean(status.browser_open);
  if (status.status === "running" || status.status === "stopped" || status.status === "error") {
    state.recorder.playwrightLaunchInFlight = false;
  }
  state.recorder.steps = Array.isArray(status.steps) ? status.steps : [];
  renderRecorderSteps();
  refreshRecorderUi();
  if (status.error) {
    stopPlaywrightRecorderPolling();
  }
  if (status.status === "stopped" || (!status.browser_open && status.status !== "launching" && status.status !== "running")) {
    stopPlaywrightRecorderPolling();
  }
}

function startPlaywrightRecorderPolling() {
  stopPlaywrightRecorderPolling();
  state.recorder.playwrightPollHandle = window.setInterval(() => {
    pollPlaywrightRecorderStatus().catch((error) => {
      state.recorder.playwrightError = error.message;
      refreshRecorderUi();
      stopPlaywrightRecorderPolling();
    });
  }, 1500);
}

async function launchPlaywrightRecorder(url) {
  if (state.recorder.playwrightLaunchInFlight) {
    return;
  }
  state.recorder.playwrightLaunchInFlight = true;
  const status = document.getElementById("monitor-recorder-status");
  setStatus(status, "Launching Chromium recorder...");
  try {
    if (state.recorder.playwrightSessionId) {
      await teardownPlaywrightRecorder(true);
    }
    const session = await api(`/api/recorder/playwright-session?url=${encodeURIComponent(url)}`, { method: "POST" });
    state.recorder.mode = "playwright";
    state.recorder.playwrightSessionId = session.session_id;
    state.recorder.playwrightStatus = session.message || session.status || "Chromium recorder launch requested.";
    state.recorder.playwrightError = "";
    state.recorder.playwrightBrowserOpen = false;
    state.recorder.steps = [];
    state.recorder.targetUrl = url;
    state.recorder.lastPageUrl = url;
    clearPlaywrightFallback();
    renderRecorderSteps();
    refreshRecorderUi();
    await pollPlaywrightRecorderStatus();
    startPlaywrightRecorderPolling();
  } catch (error) {
    state.recorder.playwrightLaunchInFlight = false;
    throw error;
  }
}

function renderRecorderSteps() {
  const host = document.getElementById("recorder-steps-list");
  const count = document.getElementById("recorder-step-count");
  if (!host) return;
  host.innerHTML = state.recorder.steps.length
    ? state.recorder.steps.map((step, index) => recorderStepMarkup(step, index)).join("")
    : `<div class="guide-card"><p>No recorded actions yet. Load a page and interact with it inside the recorder workspace.</p></div>`;
  if (count) {
    count.textContent = `${state.recorder.steps.length} recorded step${state.recorder.steps.length === 1 ? "" : "s"}`;
  }
  refreshRecorderUi();
}

function updateRecorderFrame() {
  const frame = document.getElementById("monitor-recorder-frame");
  const status = document.getElementById("monitor-recorder-status");
  if (!frame) return;
  if (!state.recorder.sessionId || !state.recorder.targetUrl) {
    frame.removeAttribute("src");
    refreshRecorderUi();
    return;
  }
  frame.src = `/api/recorder/proxy?url=${encodeURIComponent(state.recorder.targetUrl)}&session_id=${encodeURIComponent(state.recorder.sessionId)}`;
  state.recorder.mode = "in_app";
  setStatus(status, `Recorder session started for ${state.recorder.targetUrl}`);
  refreshRecorderUi();
}

function renderMonitorRecorderPage(cluster = { node_id: "monitor-1", peers: [], healthy_nodes: [] }) {
  setWorkspaceHeader("Monitor Recorder", "Load a page, walk through the journey, and turn the captured interactions into a browser monitor.", [
    { label: "Monitors", href: "/monitors" },
    { label: "Add Monitor", href: "/monitors/new" },
    { label: "Advanced Monitor", href: "/monitors/new/advanced" },
    { label: "Monitor Recorder" },
  ]);
  const nodes = assignableNodeOptions(cluster);
  const selectedNodeId = cluster.node_id || "";
  document.getElementById("app-root").innerHTML = `
    <div class="monitor-builder-layout">
      <section class="stack">
        <form class="check-form monitor-builder-form" id="monitor-recorder-form">
          <section class="panel">
            <div class="panel-head">
              <h3>Monitor Recorder Builder</h3>
              <p>Capture a browser journey inside the portal, validate it in place, and then save it as a reusable browser monitor.</p>
            </div>
            <div class="recorder-help">
              <article class="guide-card">
                <h4>How To Use The Embedded Recorder</h4>
                <ol class="recorder-help-list">
                  <li>Enter the page URL you want to monitor.</li>
                  <li>Select <strong>Start Embedded Recorder</strong> to load the page inside the portal.</li>
                  <li>Click through the page, including login fields and navigation steps.</li>
                  <li>Watch the recorded journey build below as each step is captured.</li>
                  <li>Select <strong>Test Recorded Monitor</strong> to replay the generated synthetic before saving.</li>
                </ol>
              </article>
              <article class="guide-card">
                <h4>When To Use Chromium Recorder</h4>
                <ol class="recorder-help-list">
                  <li>If the embedded page shows rate limits, access denied, or bot checks, switch to <strong>Use Chromium Recorder</strong>.</li>
                  <li>A separate Chromium window will open for the target site.</li>
                  <li>Walk through the flow there like a normal browser session.</li>
                  <li>The portal continues collecting the steps in the same journey list.</li>
                  <li>Stop Chromium, test the recorded monitor, and then save it.</li>
                </ol>
              </article>
            </div>

            <div class="stack">
              <div class="guide-card">
                <h4>1. Define The Recorder Target</h4>
                <div class="guide-grid">
                  <label><span>Target URL</span><input name="url" id="monitor-recorder-url" value="${escapeHtml(state.recorder.targetUrl || "")}" placeholder="https://example.com/login" required /></label>
                  <label><span>Wait Until</span><select name="wait_until"><option value="networkidle" selected>Network Idle</option><option value="load">Load</option><option value="domcontentloaded">DOMContentLoaded</option></select></label>
                  <label><span>Viewport Width</span><input name="viewport_width" type="number" min="320" value="1440" /></label>
                  <label><span>Viewport Height</span><input name="viewport_height" type="number" min="320" value="900" /></label>
                </div>
              </div>

              <div class="guide-card">
                <h4>2. Capture The Browser Journey</h4>
                <div class="button-row">
                  <button type="button" id="start-monitor-recorder-btn">Start Embedded Recorder</button>
                  <button type="button" class="secondary" id="use-playwright-recorder-btn">Use Chromium Recorder</button>
                  <button type="button" class="secondary hidden" id="stop-playwright-recorder-btn">Stop Chromium Recorder</button>
                  <button type="button" class="secondary" id="clear-monitor-recorder-btn">Clear Recorded Steps</button>
                </div>
                <p class="form-note">The recorder uses an embedded proxy first and lets you fall back to Chromium when a site needs a fuller browser session.</p>
                <div id="recorder-fallback-panel" class="recorder-alert hidden">
                  <strong>Embedded recorder hit a wall.</strong>
                  <p id="recorder-fallback-text"></p>
                  <p class="subtle">Switch to Chromium recorder and continue capturing the same journey in a real browser window.</p>
                </div>
                <div class="guide-grid compact-grid">
                  <article class="guide-card compact-card">
                    <h4>Recorder Session</h4>
                    <p id="monitor-recorder-session-label">${escapeHtml(state.recorder.sessionId || "Not started")}</p>
                  </article>
                  <article class="guide-card compact-card">
                    <h4>Current Page</h4>
                    <p id="monitor-recorder-page-label">${escapeHtml(state.recorder.lastPageUrl || state.recorder.targetUrl || "No page loaded")}</p>
                  </article>
                  <article class="guide-card compact-card">
                    <h4>Captured Steps</h4>
                    <p id="recorder-step-count">${state.recorder.steps.length} recorded step${state.recorder.steps.length === 1 ? "" : "s"}</p>
                  </article>
                  <article class="guide-card compact-card recorder-mode-card">
                    <h4>Recorder Mode</h4>
                    <p id="monitor-recorder-mode-value">Embedded Recorder</p>
                    <div class="status-meta"><span id="monitor-recorder-mode-hint">Using the in-app recorder frame inside the portal.</span></div>
                  </article>
                </div>
                <div class="recorder-frame-wrap" id="recorder-frame-panel">
                  <iframe id="monitor-recorder-frame" class="monitor-recorder-frame" title="Monitor Recorder"></iframe>
                </div>
                <div class="guide-card hidden" id="playwright-recorder-panel">
                  <h4>Chromium Recorder</h4>
                  <p>Chromium opens in its own window so protected sites can behave more like a normal browser session. Walk through the flow there and the recorded steps will stream back into this page.</p>
                  <p class="form-status" id="playwright-recorder-status"></p>
                </div>
                <p class="form-status" id="monitor-recorder-status"></p>
              </div>

              <div class="guide-card ${state.recorder.steps.length ? "" : "builder-locked"}">
                <h4>3. Define Assertions And Session Reuse</h4>
                <p class="subtle">${state.recorder.steps.length ? "Use the recorded journey to decide what the synthetic should validate every time it runs." : "Capture at least one recorded interaction first so this section is driven by a real journey."}</p>
                <label><span>Expected Title Contains</span><input name="expected_title_contains" placeholder="Optional title assertion" /></label>
                <label><span>Required Selectors</span><input name="required_selectors" placeholder="#app, nav a.login" /></label>
                <label class="checkbox-field"><input name="persist_auth_session" type="checkbox" /><span>Keep the authenticated browser session and reuse it when this monitor runs continuously</span></label>
                <p class="form-note">If you want this to become a continuously authenticated browser monitor, sign in during the recorder session and enable session reuse before saving.</p>
              </div>

              <div class="guide-card">
                <h4>4. Define Scheduling And Alert Conditions</h4>
                <div class="guide-grid">
                  <label><span>Interval Seconds</span><input name="interval_seconds" type="number" min="1" value="300" /></label>
                  <label><span>Timeout Seconds</span><input name="timeout_seconds" type="number" min="1" value="30" /></label>
                  <label><span>Placement</span><select name="placement_mode"><option value="auto" selected>Auto-select the healthiest least-loaded container</option><option value="specific">Choose a specific monitoring container</option></select></label>
                  <label class="field-assigned-node hidden"><span>Monitoring Container</span><select name="assigned_node_id"><option value="">Select a monitoring container</option>${nodes.map((node) => `<option value="${escapeHtml(node.node_id)}" ${selectedNodeId === node.node_id ? "selected" : ""}>${escapeHtml(node.label)}${node.healthy ? " | healthy" : " | unhealthy"} | ${escapeHtml(node.description || "")}</option>`).join("")}</select></label>
                </div>
                ${alertThresholdFieldsMarkup({ alert_thresholds: defaultAlertThresholds() }, true)}
              </div>

              <div class="guide-card">
                <h4>5. Configure The Monitor</h4>
                <div class="guide-grid">
                  <label><span>Name</span><input name="name" value="Recorded Browser Monitor" required /></label>
                  <label><span>Enabled</span><select name="enabled"><option value="true" selected>Enabled</option><option value="false">Disabled</option></select></label>
                </div>
              </div>

              <div class="guide-card">
                <h4>Recorded Journey</h4>
                <p class="subtle">These captured interactions are transformed into the synthetic browser steps that will be saved with the monitor.</p>
                <div class="stack" id="recorder-steps-list"></div>
              </div>
            </div>

            <div class="button-row monitor-builder-actions">
              <button type="button" class="secondary" id="abandon-recorder-builder-btn">Abandon</button>
              <button type="button" id="test-monitor-recorder-btn">Test Recorded Monitor</button>
              <button type="submit">Save As Browser Monitor</button>
            </div>
            <p class="form-status" id="monitor-recorder-form-status"></p>
          </section>
        </form>
      </section>
      ${recorderBuilderPreviewMarkup()}
    </div>
  `;
  renderRecorderSteps();
  updateRecorderFrame();
  refreshRecorderUi();
}

function adminSectionNavMarkup(active = "home") {
  const links = [
    ["home", "/admin", "Administration Home"],
    ["users", "/admin/users", "User Administration"],
    ["config", "/admin/config", "Application Configuration"],
    ["cluster", "/admin/cluster", "Cluster And Containers"],
  ];
  return `
    <section class="panel">
      <div class="admin-subnav">
        ${links.map(([key, href, label]) => `
          <a href="${href}" data-link class="admin-subnav-link ${active === key ? "active" : ""}">${label}</a>
        `).join("")}
      </div>
    </section>
  `;
}

function renderContainersPage(peers, containers, nodeMetrics, cluster = { enabled: false, node_id: "monitor-1", peers: [], local_assigned_checks: [] }) {
  setWorkspaceHeader("Cluster And Containers", "Configure peer monitors, add new nodes, and define how the cluster is managed.", [
    { label: "Administration", href: "/admin" },
    { label: "Cluster And Containers" },
  ]);
  const root = document.getElementById("app-root");
  const canAdmin = hasRole("admin");
  const clusterContainers = containers.available ? containers.containers : [];
  root.innerHTML = `
    <div class="stack">
      ${adminSectionNavMarkup("cluster")}
      <section class="panel">
        <div class="panel-head">
          <h3>Cluster Status</h3>
          <p>Current cluster topology, live containers, networks, and published host ports.</p>
        </div>
        <div class="guide-grid">
          <article class="guide-card">
            <h4>Cluster Mode</h4>
            <p>${cluster.enabled ? "Enabled" : "Standalone"}</p>
          </article>
          <article class="guide-card">
            <h4>Local Node</h4>
            <p>${escapeHtml(cluster.node_id || "monitor-1")}</p>
          </article>
          <article class="guide-card">
            <h4>Peer Count</h4>
            <p>${peers.length}</p>
          </article>
          <article class="guide-card">
            <h4>Tracked Containers</h4>
            <p>${clusterContainers.length}</p>
          </article>
        </div>
        <div class="stack" style="margin-top: 16px;">
          <article class="guide-card">
            <h4>Assigned Checks</h4>
            <p>${cluster.local_assigned_checks?.length ? escapeHtml(cluster.local_assigned_checks.join(", ")) : "No local check assignments currently reported."}</p>
          </article>
          ${(clusterContainers.length
            ? clusterContainers
                .map(
                  (container) => `
                    <article class="guide-card">
                      <div class="status-row">
                        <span class="dot ${container.status === "running" ? "healthy" : "disabled"}"></span>
                        <div>
                          <strong>${escapeHtml(container.name)}</strong>
                          <div class="status-meta">
                            <span>${escapeHtml(container.image)}</span>
                            <span>${escapeHtml((container.networks || []).join(", ") || "No network info")}</span>
                          </div>
                        </div>
                        <div>${nodeSparkline(container.name, nodeMetrics)}</div>
                        ${statusPill(container.status === "running" ? "healthy" : "disabled")}
                        <span class="subtle">${escapeHtml(container.status)}</span>
                      </div>
                      <div class="guide-grid" style="margin-top: 12px;">
                        <div>
                          <h4>Docker Networks</h4>
                          <p>${escapeHtml((container.networks || []).join(", ") || "No networks attached")}</p>
                        </div>
                        <div>
                          <h4>Published Ports</h4>
                          <p>${escapeHtml(
                            (container.ports || []).length
                              ? container.ports
                                  .map((port) =>
                                    `${port.host_ip || "0.0.0.0"}:${port.host_port || "-"} -> ${port.container_port}`
                                  )
                                  .join(", ")
                              : "No published host ports"
                          )}</p>
                        </div>
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<article class="guide-card"><p>No tracked cluster containers are available.</p></article>`)}
        </div>
      </section>

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
          <label><span>Monitoring Scope</span><select name="monitor_scope"><option value="full">Monitor peers and external endpoints</option><option value="peer_only">Monitor peers only</option></select></label>
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
                        <div class="status-meta"><span>${escapeHtml(peer.base_url)}</span><span>${escapeHtml(peer.monitor_scope === "peer_only" ? "Peer Only" : "Full Monitoring")}</span></div>
                      </div>
                      <div>${nodeSparkline(peer.node_id, nodeMetrics)}</div>
                      ${statusPill(peer.healthy ? "healthy" : peer.enabled ? "unhealthy" : "disabled")}
                      <span class="subtle">${escapeHtml(peer.last_error || "Peer reachable")}</span>
                    </div>
                    <label><span>Node ID</span><input name="node_id" value="${escapeHtml(peer.node_id)}" required ${canAdmin ? "" : "disabled"} /></label>
                    <label><span>Base URL</span><input name="base_url" value="${escapeHtml(peer.base_url)}" required ${canAdmin ? "" : "disabled"} /></label>
                    <label><span>Container Name</span><input name="container_name" value="${escapeHtml(peer.container_name || "")}" ${canAdmin ? "" : "disabled"} /></label>
                    <label><span>Monitoring Scope</span><select name="monitor_scope" ${canAdmin ? "" : "disabled"}><option value="full" ${peer.monitor_scope !== "peer_only" ? "selected" : ""}>Monitor peers and external endpoints</option><option value="peer_only" ${peer.monitor_scope === "peer_only" ? "selected" : ""}>Monitor peers only</option></select></label>
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
          <p>Create a new monitor container and let the portal infer the image, networking, and runtime wiring automatically.</p>
        </div>
        <form id="create-container-form" class="check-form ${canAdmin ? "" : "hidden"}">
          <label><span>Node ID</span><input name="node_id" placeholder="monitor-4" required /></label>
          <label><span>Container Name</span><input name="container_name" placeholder="Leave blank to use the node ID" /></label>
          <label><span>Monitoring Scope</span><select name="monitor_scope"><option value="full">Monitor peers and external endpoints</option><option value="peer_only">Monitor peers only</option></select></label>
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
                  <div class="status-meta"><span>${escapeHtml(container.image)}</span><span>${escapeHtml((container.networks || []).join(", ") || "No network info")}</span></div>
                </div>
                <div>${nodeSparkline(container.name, nodeMetrics)}</div>
                ${statusPill(container.status === "running" ? "healthy" : "disabled")}
                <span class="subtle">${escapeHtml(container.status)}</span>
              </div>
              <div class="guide-grid" style="margin-top: 12px;">
                <div>
                  <h4>Host Ports</h4>
                  <p>${escapeHtml(
                    (container.ports || []).length
                      ? container.ports
                          .map((port) =>
                            `${port.host_ip || "0.0.0.0"}:${port.host_port || "-"} -> ${port.container_port}`
                          )
                          .join(", ")
                      : "No published host ports"
                  )}</p>
                </div>
                <div>
                  <h4>Monitoring Scope</h4>
                  <p>${escapeHtml(((peers.find((peer) => peer.container_name === container.name || peer.node_id === container.name) || {}).monitor_scope) === "peer_only" ? "Peer only" : "Full monitoring")}</p>
                </div>
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
  setWorkspaceHeader(container.name, "Manage the current live container and review its cluster health.", [
    { label: "Administration", href: "/admin" },
    { label: "Cluster And Containers", href: "/admin/cluster" },
    { label: container.name },
  ]);
  const root = document.getElementById("app-root");
  const canAdmin = hasRole("admin");
  const status = container.status === "running" ? "healthy" : "disabled";
  root.innerHTML = `
    <div class="stack">
      ${adminSectionNavMarkup("cluster")}
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
            <h4>Monitoring Scope</h4>
            <p>${escapeHtml(peer?.monitor_scope === "peer_only" ? "Peer only" : "Full monitoring")}</p>
          </article>
          <article class="guide-card">
            <h4>Recovery</h4>
            <p>${peer?.recovery?.enabled ? "Enabled" : "Disabled"}</p>
          </article>
          <article class="guide-card">
            <h4>Heartbeat</h4>
            <p>${peer?.last_ok_at ? fmtTime(peer.last_ok_at) : "No heartbeat recorded yet"}</p>
          </article>
          <article class="guide-card">
            <h4>Docker Networks</h4>
            <p>${escapeHtml((container.networks || []).join(", ") || "No networks attached")}</p>
          </article>
          <article class="guide-card">
            <h4>Published Ports</h4>
            <p>${escapeHtml(
              (container.ports || []).length
                ? container.ports
                    .map((port) => `${port.host_ip || "0.0.0.0"}:${port.host_port || "-"} -> ${port.container_port}`)
                    .join(", ")
                : "No published host ports"
            )}</p>
          </article>
        </div>
      </section>
      </div>
    </div>
  `;
}

function guideSectionHref(sectionId = "all") {
  return sectionId && sectionId !== "all" ? `/guide?section=${encodeURIComponent(sectionId)}` : "/guide";
}

function guideTopicHref(sectionId, topicId) {
  return `/guide?section=${encodeURIComponent(sectionId)}&topic=${encodeURIComponent(topicId)}`;
}

function helpSection(sectionId) {
  return HELP_SECTIONS.find((section) => section.id === sectionId) || HELP_SECTIONS[0];
}

function helpTopic(topicId) {
  return HELP_TOPICS.find((topic) => topic.id === topicId) || null;
}

function helpTopicSearchText(topic) {
  return [topic.title, topic.summary, ...(topic.keywords || [])].join(" ").toLowerCase();
}

function firstHelpTopicForSection(sectionId) {
  return HELP_TOPICS.find((topic) => topic.section === sectionId) || null;
}

function thirdPartyLibrariesMarkup() {
  return `
    <div class="help-library-table-wrap">
      <table class="help-library-table">
        <thead>
          <tr>
            <th>Library</th>
            <th>Used For</th>
            <th>Declared Version</th>
            <th>Observed Version</th>
            <th>License</th>
          </tr>
        </thead>
        <tbody>
          ${THIRD_PARTY_LIBRARIES.map((library) => `
            <tr>
              <td>
                <strong>${escapeHtml(library.name)}</strong>
                ${library.url ? `<div><a href="${escapeHtml(library.url)}" target="_blank" rel="noreferrer">Project</a></div>` : ""}
              </td>
              <td>${escapeHtml(library.area)}</td>
              <td>${escapeHtml(library.declared)}</td>
              <td>${escapeHtml(library.version)}</td>
              <td>${escapeHtml(library.license)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function filteredHelpTopics(query = "", sectionId = "all") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return HELP_TOPICS.filter((topic) => {
    const sectionMatch = sectionId === "all" || topic.section === sectionId;
    const queryMatch = !normalizedQuery || helpTopicSearchText(topic).includes(normalizedQuery);
    return sectionMatch && queryMatch;
  });
}

function helpSectionPillsMarkup(activeSection, activeTopicId) {
  const allHref = activeTopicId ? `/guide?topic=${encodeURIComponent(activeTopicId)}` : "/guide";
  return `
    <div class="help-section-pills">
      <a href="${allHref}" data-link class="help-section-pill ${activeSection === "all" ? "active" : ""}">All Topics</a>
      ${HELP_SECTIONS.map((section) => `
        <a
          href="${guideTopicHref(section.id, firstHelpTopicForSection(section.id)?.id || "")}"
          data-link
          class="help-section-pill ${activeSection === section.id ? "active" : ""}"
        >${escapeHtml(section.title)}</a>
      `).join("")}
    </div>
  `;
}

function helpSidebarMarkup(topics, activeSection, activeTopicId) {
  const grouped = HELP_SECTIONS.map((section) => ({
    ...section,
    topics: topics.filter((topic) => topic.section === section.id),
  })).filter((section) => activeSection === "all" || section.id === activeSection || section.topics.length);

  return `
    <aside class="help-sidebar-panel">
      <div class="panel-head compact">
        <h3>Knowledge Base</h3>
        <p>Browse by area of responsibility.</p>
      </div>
      <div class="help-topic-groups">
        ${grouped.map((section) => `
          <section class="help-topic-group">
            <a href="${guideTopicHref(section.id, firstHelpTopicForSection(section.id)?.id || "")}" data-link class="help-topic-group-title">${escapeHtml(section.title)}</a>
            <p>${escapeHtml(section.summary)}</p>
            <div class="help-topic-links">
              ${section.topics.length
                ? section.topics.map((topic) => `
                  <a
                    href="${guideTopicHref(section.id, topic.id)}"
                    data-link
                    class="help-topic-link ${topic.id === activeTopicId ? "active" : ""}"
                  >
                    <strong>${escapeHtml(topic.title)}</strong>
                    <span>${escapeHtml(topic.summary)}</span>
                  </a>
                `).join("")
                : `<div class="help-topic-empty">No topics match the current search.</div>`}
            </div>
          </section>
        `).join("")}
      </div>
    </aside>
  `;
}

function helpDiagramCardMarkup(src, alt, title, description) {
  return `
    <article class="help-diagram-card">
      <button
        type="button"
        class="help-diagram-button"
        data-help-diagram-src="${escapeHtml(src)}"
        data-help-diagram-alt="${escapeHtml(alt)}"
        data-help-diagram-title="${escapeHtml(title)}"
      >
        <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />
      </button>
      <div>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(description)}</p>
        <button
          type="button"
          class="button-link secondary help-diagram-expand"
          data-help-diagram-src="${escapeHtml(src)}"
          data-help-diagram-alt="${escapeHtml(alt)}"
          data-help-diagram-title="${escapeHtml(title)}"
        >Expand Diagram</button>
      </div>
    </article>
  `;
}

function helpOverviewMarkup(filteredTopicsList, activeSection, query) {
  const visibleSection = activeSection === "all" ? null : helpSection(activeSection);
  const quickTopics = filteredTopicsList.slice(0, 6);
  return `
    <article class="panel help-article">
      <div class="panel-head">
        <h3>${visibleSection ? escapeHtml(visibleSection.title) : "Help Center"}</h3>
        <p>${visibleSection ? escapeHtml(visibleSection.summary) : "Use search, section links, and topic articles to learn the application from first login through advanced operations."}</p>
      </div>
      <section class="help-welcome-card">
        <div>
          <p class="eyebrow">Searchable operator guide</p>
          <h3>Use this page like an internal wiki</h3>
          <p>Search for a task, choose a functional area, and open a topic article. The knowledge base is organized around what operators actually do: creating monitors, reading dashboards, managing the cluster, and configuring the service.</p>
        </div>
        <div class="help-link-grid">
          <a class="button-link" href="${guideTopicHref("getting-started", "getting-started")}" data-link>Start Here</a>
          <a class="button-link secondary" href="${guideTopicHref("monitors", "basic-monitors")}" data-link>Build A Monitor</a>
          <a class="button-link secondary" href="${guideTopicHref("operations", "dashboards-and-troubleshooting")}" data-link>Read Dashboards</a>
        </div>
      </section>
      <section class="help-diagram-gallery">
        ${helpDiagramCardMarkup("/help-assets/architecture-overview.svg", "Architecture overview diagram", "Platform Architecture", "Shows how the portal, config store, runner, targets, and telemetry layers connect.")}
        ${helpDiagramCardMarkup("/help-assets/monitor-lifecycle.svg", "Monitor lifecycle diagram", "Monitor Lifecycle", "Shows how operators create, place, observe, and continuously tune monitors.")}
        ${helpDiagramCardMarkup("/help-assets/telemetry-data-layer.svg", "Telemetry data layer diagram", "Telemetry Data Layer", "Explains the PostgreSQL plus object-storage split for metrics and rich diagnostics.")}
      </section>
      <section class="help-results-section">
        <div class="mini-panel-header">
          <h4>${query ? `Search Results for "${escapeHtml(query)}"` : "Popular Topics"}</h4>
          <span>${filteredTopicsList.length} topic${filteredTopicsList.length === 1 ? "" : "s"}</span>
        </div>
        <div class="help-results-grid">
          ${quickTopics.length ? quickTopics.map((topic) => `
            <a href="${guideTopicHref(topic.section, topic.id)}" data-link class="help-result-card">
              <span class="help-parent-chip">${escapeHtml(helpSection(topic.section).title)}</span>
              <h4>${escapeHtml(topic.title)}</h4>
              <p>${escapeHtml(topic.summary)}</p>
            </a>
          `).join("") : `<div class="guide-card"><p>No help topics match the current search.</p></div>`}
        </div>
      </section>
    </article>
  `;
}

function helpArticleMarkup(topic) {
  const section = helpSection(topic.section);
  const related = HELP_TOPICS.filter((candidate) => candidate.section === topic.section && candidate.id !== topic.id).slice(0, 3);
  return `
    <article class="panel help-article">
      <div class="panel-head">
        <div class="help-topic-header">
          <span class="help-parent-chip">${escapeHtml(section.title)}</span>
          <h3>${escapeHtml(topic.title)}</h3>
          <p>${escapeHtml(topic.summary)}</p>
        </div>
      </div>
      <div class="help-topic-body">
        ${topic.content()}
      </div>
      <section class="help-related-topics">
        <div class="mini-panel-header">
          <h4>Related Topics</h4>
          <span>Keep exploring this area</span>
        </div>
        <div class="help-results-grid">
          ${related.length ? related.map((relatedTopic) => `
            <a href="${guideTopicHref(relatedTopic.section, relatedTopic.id)}" data-link class="help-result-card">
              <h4>${escapeHtml(relatedTopic.title)}</h4>
              <p>${escapeHtml(relatedTopic.summary)}</p>
            </a>
          `).join("") : `<div class="guide-card"><p>This topic is the best entry point for this section.</p></div>`}
        </div>
      </section>
    </article>
  `;
}

function renderGuidePage() {
  const params = new URLSearchParams(window.location.search);
  if (!state.helpWorkspace.query && params.get("q")) {
    state.helpWorkspace.query = params.get("q") || "";
  }
  const activeSection = params.get("section") || "all";
  const activeTopicId = params.get("topic") || "";
  const query = state.helpWorkspace.query || "";
  const matchingTopics = filteredHelpTopics(query, activeSection);
  const selectedTopic = activeTopicId
    ? helpTopic(activeTopicId)
    : (activeSection !== "all" && !query ? firstHelpTopicForSection(activeSection) : null);
  const showArticle = selectedTopic && (!query || matchingTopics.some((topic) => topic.id === selectedTopic.id));

  setWorkspaceHeader("Help", "Searchable guidance for first-time users, monitor builders, operators, and administrators.", [
    { label: "Help" },
    ...(showArticle ? [{ label: selectedTopic.title }] : []),
  ]);

  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="panel-head">
          <h3>Help Explorer</h3>
          <p>Search by task, drill into functional areas, and open step-by-step guidance without leaving the portal.</p>
        </div>
        <div class="help-toolbar">
          <label class="help-search">
            <span>Search Help</span>
            <input type="search" id="help-search" placeholder="Try: browser monitor, telemetry, roles, offline deployment" value="${escapeHtml(query)}" />
          </label>
          <button type="button" id="help-search-clear" class="secondary">Clear Search</button>
        </div>
        ${helpSectionPillsMarkup(activeSection, activeTopicId)}
      </section>
      <div class="help-layout">
        ${helpSidebarMarkup(matchingTopics, activeSection, activeTopicId)}
        ${showArticle ? helpArticleMarkup(selectedTopic) : helpOverviewMarkup(matchingTopics, activeSection, query)}
      </div>
      <div id="help-diagram-lightbox" class="help-diagram-lightbox hidden" role="dialog" aria-modal="true" aria-labelledby="help-diagram-lightbox-title">
        <div class="help-diagram-lightbox-backdrop" data-help-diagram-close></div>
        <div class="help-diagram-lightbox-panel">
          <div class="help-diagram-lightbox-head">
            <h3 id="help-diagram-lightbox-title">Diagram</h3>
            <button type="button" class="secondary" data-help-diagram-close>Close</button>
          </div>
          <div class="help-diagram-lightbox-body">
            <img id="help-diagram-lightbox-image" src="" alt="" />
          </div>
        </div>
      </div>
    </div>
  `;
}

function openHelpDiagramLightbox(src, alt, title) {
  const lightbox = document.getElementById("help-diagram-lightbox");
  const image = document.getElementById("help-diagram-lightbox-image");
  const heading = document.getElementById("help-diagram-lightbox-title");
  if (!lightbox || !image || !heading) return;
  image.src = src;
  image.alt = alt || title || "Expanded help diagram";
  heading.textContent = title || "Diagram";
  lightbox.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeHelpDiagramLightbox() {
  const lightbox = document.getElementById("help-diagram-lightbox");
  const image = document.getElementById("help-diagram-lightbox-image");
  if (!lightbox || lightbox.classList.contains("hidden")) return;
  lightbox.classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (image) {
    image.src = "";
    image.alt = "";
  }
}

function renderAdminPage(users, telemetry, portalSettings, emailSettings, uiScaling) {
  setWorkspaceHeader("Administration", "Create accounts and control who can view, edit, or fully administer the platform.", [
    { label: "Administration" },
  ]);
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
                <span>${telemetry?.timeseries_provider === "oci_postgresql" ? "OCI PostgreSQL" : "Local PostgreSQL"}</span>
                <span>${telemetry?.object_provider === "oci_object_storage" ? "OCI Object Storage" : "MinIO Compatible Object Store"}</span>
                <span>${telemetry?.retention_hours || 2} hour retention</span>
              </div>
            </div>
          </summary>
          <div class="accordion-body">
            <form id="telemetry-form" class="check-form">
              <h4>Timeseries</h4>
              <label>
                <span>Enabled</span>
                <select name="enabled">
                  <option value="true" ${telemetry?.enabled ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!telemetry?.enabled ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>PostgreSQL Target</span>
                <select name="timeseries_provider">
                  <option value="local_postgresql" ${telemetry?.timeseries_provider === "local_postgresql" ? "selected" : ""}>Local PostgreSQL Instance</option>
                  <option value="oci_postgresql" ${telemetry?.timeseries_provider === "oci_postgresql" ? "selected" : ""}>OCI Hosted PostgreSQL</option>
                </select>
              </label>
              <label>
                <span>Provision Local PostgreSQL For Me</span>
                <select name="auto_provision_timeseries_local">
                  <option value="true" ${telemetry?.auto_provision_timeseries_local ? "selected" : ""}>Yes, provision it automatically</option>
                  <option value="false" ${!telemetry?.auto_provision_timeseries_local ? "selected" : ""}>No, I will point to my own server</option>
                </select>
              </label>
              <label><span>Local PostgreSQL Container Name</span><input name="timeseries_local_container_name" value="${escapeHtml(telemetry?.timeseries_local_container_name || "async-service-monitor-postgres")}" /></label>
              <label data-telemetry-timeseries-managed><span>Host</span><input name="timeseries_host" value="${escapeHtml(telemetry?.timeseries_host || "")}" placeholder="postgres.example.internal" /></label>
              <label data-telemetry-timeseries-managed><span>Port</span><input name="timeseries_port" type="number" min="1" value="${escapeHtml(telemetry?.timeseries_port || 5432)}" /></label>
              <label data-telemetry-timeseries-managed><span>Database</span><input name="timeseries_database" value="${escapeHtml(telemetry?.timeseries_database || "")}" /></label>
              <label data-telemetry-timeseries-managed><span>Username</span><input name="timeseries_username" value="${escapeHtml(telemetry?.timeseries_username || "")}" /></label>
              <label data-telemetry-timeseries-managed><span>Password</span><input name="timeseries_password" type="password" value="${escapeHtml(telemetry?.timeseries_password || "")}" /></label>
              <label data-telemetry-timeseries-managed><span>Use SSL</span><select name="timeseries_use_ssl"><option value="true" ${telemetry?.timeseries_use_ssl ? "selected" : ""}>Enabled</option><option value="false" ${!telemetry?.timeseries_use_ssl ? "selected" : ""}>Disabled</option></select></label>
              <label><span>Retention Hours</span><input name="retention_hours" type="number" min="1" value="${escapeHtml(telemetry?.retention_hours || 2)}" /></label>

              <h4>Diagnostics Object Storage</h4>
              <label>
                <span>Object Storage Target</span>
                <select name="object_provider">
                  <option value="local_minio" ${telemetry?.object_provider === "local_minio" ? "selected" : ""}>Local MinIO</option>
                  <option value="oci_object_storage" ${telemetry?.object_provider === "oci_object_storage" ? "selected" : ""}>OCI Object Storage</option>
                </select>
              </label>
              <label>
                <span>Provision Local MinIO For Me</span>
                <select name="auto_provision_object_local">
                  <option value="true" ${telemetry?.auto_provision_object_local ? "selected" : ""}>Yes, provision it automatically</option>
                  <option value="false" ${!telemetry?.auto_provision_object_local ? "selected" : ""}>No, I will point to my own server</option>
                </select>
              </label>
              <label><span>Local MinIO Container Name</span><input name="object_local_container_name" value="${escapeHtml(telemetry?.object_local_container_name || "async-service-monitor-minio")}" /></label>
              <label><span>Local MinIO Console Port</span><input name="object_console_port" type="number" min="1" value="${escapeHtml(telemetry?.object_console_port || 9001)}" /></label>
              <label data-telemetry-object-managed><span>Endpoint</span><input name="object_endpoint" value="${escapeHtml(telemetry?.object_endpoint || "")}" placeholder="http://127.0.0.1:9000" /></label>
              <label data-telemetry-object-managed><span>Bucket</span><input name="object_bucket" value="${escapeHtml(telemetry?.object_bucket || "async-service-monitor")}" /></label>
              <label data-telemetry-object-managed><span>Access Key</span><input name="object_access_key" value="${escapeHtml(telemetry?.object_access_key || "")}" /></label>
              <label data-telemetry-object-managed><span>Secret Key</span><input name="object_secret_key" type="password" value="${escapeHtml(telemetry?.object_secret_key || "")}" /></label>
              <label data-telemetry-object-managed><span>Region</span><input name="object_region" value="${escapeHtml(telemetry?.object_region || "")}" placeholder="us-phoenix-1" /></label>
              <label data-telemetry-object-managed><span>Use TLS</span><select name="object_use_ssl"><option value="true" ${telemetry?.object_use_ssl ? "selected" : ""}>Enabled</option><option value="false" ${!telemetry?.object_use_ssl ? "selected" : ""}>Disabled</option></select></label>
              <button type="submit">Save Telemetry Settings</button>
              <p class="form-note">Timeseries data is retained in PostgreSQL, while full diagnostics and config snapshots are retained in MinIO or OCI Object Storage.</p>
              <p class="form-note" id="telemetry-managed-note"></p>
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
              <strong>UI Scaling</strong>
              <div class="status-meta">
                <span>${uiScaling?.enabled ? `${uiScaling.dashboard_replicas} dashboard replicas` : "Disabled"}</span>
                <span>${uiScaling?.session_strategy === "sticky_proxy" ? "Sticky proxy sessions" : "Shared signed sessions"}</span>
              </div>
            </div>
          </summary>
          <div class="accordion-body">
            <form id="ui-scaling-form" class="check-form">
              <label>
                <span>Enable UI Scaling</span>
                <select name="enabled">
                  <option value="true" ${uiScaling?.enabled ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!uiScaling?.enabled ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label>
                <span>Session Handling</span>
                <select name="session_strategy">
                  <option value="shared_cookie" ${!uiScaling?.session_strategy || uiScaling?.session_strategy === "shared_cookie" ? "selected" : ""}>Shared signed sessions</option>
                  <option value="sticky_proxy" ${uiScaling?.session_strategy === "sticky_proxy" ? "selected" : ""}>Sticky proxy sessions</option>
                </select>
              </label>
              <label>
                <span>Enable Sticky Sessions</span>
                <select name="sticky_sessions">
                  <option value="true" ${uiScaling?.sticky_sessions ? "selected" : ""}>Enabled</option>
                  <option value="false" ${!uiScaling?.sticky_sessions ? "selected" : ""}>Disabled</option>
                </select>
              </label>
              <label><span>Dashboard Replica Count</span><input name="dashboard_replicas" type="number" min="1" max="10" value="${escapeHtml(uiScaling?.dashboard_replicas || 2)}" /></label>
              <label><span>Proxy Container Name</span><input name="proxy_container_name" value="${escapeHtml(uiScaling?.proxy_container_name || "async-service-monitor-proxy")}" /></label>
              <label><span>Dashboard Container Prefix</span><input name="dashboard_container_prefix" value="${escapeHtml(uiScaling?.dashboard_container_prefix || "async-service-monitor-dashboard")}" /></label>
              <label><span>Proxy Port</span><input name="proxy_port" type="number" min="1" value="${escapeHtml(uiScaling?.proxy_port || 8000)}" /></label>
              <div class="guide-card">
                <h4>Scaling Notes</h4>
                <p>When enabled, the service provisions Docker-based dashboard replicas and a proxy automatically. Shared telemetry is required, and the portal will auto-generate a shared session secret if one is missing.</p>
              </div>
              <button type="submit">Save UI Scaling</button>
              <p class="form-status" id="ui-scaling-status"></p>
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
              <div class="guide-card">
                <h4>Session Handling</h4>
                <p>${portalSettings?.session_secret_configured ? "A shared signed session secret is configured for multi-container portal access." : "A shared session secret will be generated automatically when scaled UI mode is enabled."}</p>
              </div>
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

function renderAdminHomePage(users, telemetry, portalSettings, emailSettings, uiScaling, clusterSummary = {}) {
  setWorkspaceHeader("Administration", "Choose the part of the platform you want to administer.", [
    { label: "Administration" },
  ]);
  const root = document.getElementById("app-root");
  const enabledUsers = users.filter((user) => user.enabled).length;
  const trackedContainers = clusterSummary?.containers?.available ? (clusterSummary.containers.containers || []).length : 0;
  root.innerHTML = `
    <div class="stack">
      ${adminSectionNavMarkup("home")}
      <section class="panel">
        <div class="panel-head">
          <h3>Administration Home</h3>
          <p>Open a focused administrative workspace instead of managing everything from one long page.</p>
        </div>
        <div class="guide-grid">
          <a class="guide-card admin-home-card" href="/admin/users" data-link>
            <h4>User Administration</h4>
            <p>Create accounts, assign roles, disable access, and manage who can operate the portal.</p>
            <div class="status-meta">
              <span>${users.length} accounts</span>
              <span>${enabledUsers} enabled</span>
            </div>
          </a>
          <a class="guide-card admin-home-card" href="/admin/config" data-link>
            <h4>Application Configuration</h4>
            <p>Set up telemetry, notifications, scaling, portal auth, and cloud integration options.</p>
            <div class="status-meta">
              <span>${telemetry?.enabled ? "Telemetry enabled" : "Telemetry disabled"}</span>
              <span>${emailSettings?.enabled ? "Notifications enabled" : "Notifications disabled"}</span>
              <span>${uiScaling?.enabled ? "Scaled UI enabled" : "Scaled UI disabled"}</span>
            </div>
          </a>
          <a class="guide-card admin-home-card" href="/admin/cluster" data-link>
            <h4>Cluster And Containers</h4>
            <p>Manage peers, monitoring containers, container topology, Docker networks, and live cluster health.</p>
            <div class="status-meta">
              <span>${clusterSummary?.enabled ? "Cluster mode" : "Standalone mode"}</span>
              <span>${trackedContainers} tracked containers</span>
            </div>
          </a>
        </div>
        <div class="guide-card">
          <h4>Why The Split</h4>
          <p>User management, service configuration, and cluster operations are separate responsibilities. Breaking them into dedicated pages keeps each workflow smaller, clearer, and faster to use.</p>
        </div>
      </section>
    </div>
  `;
}

function renderAdminUsersPage(users) {
  setWorkspaceHeader("User Administration", "Manage user accounts, roles, and access to the portal.", [
    { label: "Administration", href: "/admin" },
    { label: "User Administration" },
  ]);
  const root = document.getElementById("app-root");
  const enabledUsers = users.filter((user) => user.enabled).length;
  root.innerHTML = `
    <div class="stack">
      ${adminSectionNavMarkup("users")}
      <section class="panel">
        <div class="panel-head">
          <h3>User Administration</h3>
          <p>Create accounts and manage read-only, read-write, and administrator access.</p>
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
            </summary>
            <div class="accordion-body">
              <div class="stack">
                ${users.map((user) => `
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
                `).join("")}
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  `;
}

function renderAdminConfigPage(telemetry, portalSettings, emailSettings, uiScaling) {
  setWorkspaceHeader("Application Configuration", "Configure notifications, storage, UI scaling, and cloud integrations.", [
    { label: "Administration", href: "/admin" },
    { label: "Application Configuration" },
  ]);
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="stack">
      ${adminSectionNavMarkup("config")}
      <section class="panel">
        <div class="panel-head">
          <h3>Application Configuration</h3>
          <p>Set up telemetry storage, email notifications, scaled dashboards, authentication, and OCI-ready service integrations.</p>
        </div>
        <div class="accordion">
          <details class="accordion-item">
            <summary class="accordion-summary">
              <div>
                <strong>Telemetry Storage</strong>
                <div class="status-meta">
                  <span>${telemetry?.timeseries_provider === "oci_postgresql" ? "OCI PostgreSQL" : "Local PostgreSQL"}</span>
                  <span>${telemetry?.object_provider === "oci_object_storage" ? "OCI Object Storage" : "MinIO Compatible Object Store"}</span>
                  <span>${telemetry?.retention_hours || 2} hour retention</span>
                </div>
              </div>
            </summary>
            <div class="accordion-body">
              <form id="telemetry-form" class="check-form">
                <h4>Timeseries</h4>
                <label>
                  <span>Enabled</span>
                  <select name="enabled">
                    <option value="true" ${telemetry?.enabled ? "selected" : ""}>Enabled</option>
                    <option value="false" ${!telemetry?.enabled ? "selected" : ""}>Disabled</option>
                  </select>
                </label>
                <label>
                  <span>PostgreSQL Target</span>
                  <select name="timeseries_provider">
                    <option value="local_postgresql" ${telemetry?.timeseries_provider === "local_postgresql" ? "selected" : ""}>Local PostgreSQL Instance</option>
                    <option value="oci_postgresql" ${telemetry?.timeseries_provider === "oci_postgresql" ? "selected" : ""}>OCI Hosted PostgreSQL</option>
                  </select>
                </label>
                <label>
                  <span>Provision Local PostgreSQL For Me</span>
                  <select name="auto_provision_timeseries_local">
                    <option value="true" ${telemetry?.auto_provision_timeseries_local ? "selected" : ""}>Yes, provision it automatically</option>
                    <option value="false" ${!telemetry?.auto_provision_timeseries_local ? "selected" : ""}>No, I will point to my own server</option>
                  </select>
                </label>
                <label><span>Local PostgreSQL Container Name</span><input name="timeseries_local_container_name" value="${escapeHtml(telemetry?.timeseries_local_container_name || "async-service-monitor-postgres")}" /></label>
                <label data-telemetry-timeseries-managed><span>Host</span><input name="timeseries_host" value="${escapeHtml(telemetry?.timeseries_host || "")}" placeholder="postgres.example.internal" /></label>
                <label data-telemetry-timeseries-managed><span>Port</span><input name="timeseries_port" type="number" min="1" value="${escapeHtml(telemetry?.timeseries_port || 5432)}" /></label>
                <label data-telemetry-timeseries-managed><span>Database</span><input name="timeseries_database" value="${escapeHtml(telemetry?.timeseries_database || "")}" /></label>
                <label data-telemetry-timeseries-managed><span>Username</span><input name="timeseries_username" value="${escapeHtml(telemetry?.timeseries_username || "")}" /></label>
                <label data-telemetry-timeseries-managed><span>Password</span><input name="timeseries_password" type="password" value="${escapeHtml(telemetry?.timeseries_password || "")}" /></label>
                <label data-telemetry-timeseries-managed><span>Use SSL</span><select name="timeseries_use_ssl"><option value="true" ${telemetry?.timeseries_use_ssl ? "selected" : ""}>Enabled</option><option value="false" ${!telemetry?.timeseries_use_ssl ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Retention Hours</span><input name="retention_hours" type="number" min="1" value="${escapeHtml(telemetry?.retention_hours || 2)}" /></label>

                <h4>Diagnostics Object Storage</h4>
                <label>
                  <span>Object Storage Target</span>
                  <select name="object_provider">
                    <option value="local_minio" ${telemetry?.object_provider === "local_minio" ? "selected" : ""}>Local MinIO</option>
                    <option value="oci_object_storage" ${telemetry?.object_provider === "oci_object_storage" ? "selected" : ""}>OCI Object Storage</option>
                  </select>
                </label>
                <label>
                  <span>Provision Local MinIO For Me</span>
                  <select name="auto_provision_object_local">
                    <option value="true" ${telemetry?.auto_provision_object_local ? "selected" : ""}>Yes, provision it automatically</option>
                    <option value="false" ${!telemetry?.auto_provision_object_local ? "selected" : ""}>No, I will point to my own server</option>
                  </select>
                </label>
                <label><span>Local MinIO Container Name</span><input name="object_local_container_name" value="${escapeHtml(telemetry?.object_local_container_name || "async-service-monitor-minio")}" /></label>
                <label><span>Local MinIO Console Port</span><input name="object_console_port" type="number" min="1" value="${escapeHtml(telemetry?.object_console_port || 9001)}" /></label>
                <label data-telemetry-object-managed><span>Endpoint</span><input name="object_endpoint" value="${escapeHtml(telemetry?.object_endpoint || "")}" placeholder="http://127.0.0.1:9000" /></label>
                <label data-telemetry-object-managed><span>Bucket</span><input name="object_bucket" value="${escapeHtml(telemetry?.object_bucket || "async-service-monitor")}" /></label>
                <label data-telemetry-object-managed><span>Access Key</span><input name="object_access_key" value="${escapeHtml(telemetry?.object_access_key || "")}" /></label>
                <label data-telemetry-object-managed><span>Secret Key</span><input name="object_secret_key" type="password" value="${escapeHtml(telemetry?.object_secret_key || "")}" /></label>
                <label data-telemetry-object-managed><span>Region</span><input name="object_region" value="${escapeHtml(telemetry?.object_region || "")}" placeholder="us-phoenix-1" /></label>
                <label data-telemetry-object-managed><span>Use TLS</span><select name="object_use_ssl"><option value="true" ${telemetry?.object_use_ssl ? "selected" : ""}>Enabled</option><option value="false" ${!telemetry?.object_use_ssl ? "selected" : ""}>Disabled</option></select></label>
                <button type="submit">Save Telemetry Settings</button>
                <p class="form-note">Timeseries data is retained in PostgreSQL, while full diagnostics and config snapshots are retained in MinIO or OCI Object Storage.</p>
                <p class="form-note" id="telemetry-managed-note"></p>
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
            </summary>
            <div class="accordion-body">
              <form id="email-settings-form" class="check-form">
                <label><span>Enabled</span><select name="enabled"><option value="true" ${emailSettings?.enabled ? "selected" : ""}>Enabled</option><option value="false" ${!emailSettings?.enabled ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Email Provider</span><select name="provider"><option value="m365" ${emailSettings?.provider === "m365" ? "selected" : ""}>Microsoft 365</option><option value="yahoo" ${emailSettings?.provider === "yahoo" ? "selected" : ""}>Yahoo Mail</option><option value="gmail" ${emailSettings?.provider === "gmail" ? "selected" : ""}>Gmail</option><option value="outlook" ${emailSettings?.provider === "outlook" ? "selected" : ""}>Outlook</option><option value="custom" ${!emailSettings?.provider || emailSettings?.provider === "custom" ? "selected" : ""}>Custom Email Service</option></select></label>
                <label><span>Provision Local Email Service For Me</span><select name="auto_provision_local"><option value="true" ${emailSettings?.auto_provision_local ? "selected" : ""}>Yes, build and wire a local mail container</option><option value="false" ${!emailSettings?.auto_provision_local ? "selected" : ""}>No, I will use an existing email service</option></select></label>
                <label><span>SMTP Host</span><input name="host" value="${escapeHtml(emailSettings?.host || "")}" placeholder="smtp.gmail.com" /></label>
                <label><span>SMTP Port</span><input name="port" type="number" min="1" value="${escapeHtml(emailSettings?.port || 587)}" /></label>
                <label><span>Username</span><input name="username" value="${escapeHtml(emailSettings?.username || "")}" placeholder="alerts@example.com" /></label>
                <label><span>Password</span><input name="password" type="password" value="${escapeHtml(emailSettings?.password || "")}" /></label>
                <label><span>From Address</span><input name="from_address" value="${escapeHtml(emailSettings?.from_address || "")}" placeholder="monitor@example.com" /></label>
                <label><span>To Addresses</span><input name="to_addresses" value="${escapeHtml(csv(emailSettings?.to_addresses || []))}" placeholder="admin@example.com, oncall@example.com" /></label>
                <label><span>Subject Prefix</span><input name="subject_prefix" value="${escapeHtml(emailSettings?.subject_prefix || "[async-service-monitor]")}" /></label>
                <label><span>Use STARTTLS</span><select name="use_tls"><option value="true" ${emailSettings?.use_tls !== false ? "selected" : ""}>Enabled</option><option value="false" ${emailSettings?.use_tls === false ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Use SSL</span><select name="use_ssl"><option value="true" ${emailSettings?.use_ssl ? "selected" : ""}>Enabled</option><option value="false" ${!emailSettings?.use_ssl ? "selected" : ""}>Disabled</option></select></label>
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
                <strong>UI Scaling</strong>
                <div class="status-meta">
                  <span>${uiScaling?.enabled ? `${uiScaling.dashboard_replicas} dashboard replicas` : "Disabled"}</span>
                  <span>${uiScaling?.session_strategy === "sticky_proxy" ? "Sticky proxy sessions" : "Shared signed sessions"}</span>
                </div>
              </div>
            </summary>
            <div class="accordion-body">
              <form id="ui-scaling-form" class="check-form">
                <label><span>Enable UI Scaling</span><select name="enabled"><option value="true" ${uiScaling?.enabled ? "selected" : ""}>Enabled</option><option value="false" ${!uiScaling?.enabled ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Session Handling</span><select name="session_strategy"><option value="shared_cookie" ${!uiScaling?.session_strategy || uiScaling?.session_strategy === "shared_cookie" ? "selected" : ""}>Shared signed sessions</option><option value="sticky_proxy" ${uiScaling?.session_strategy === "sticky_proxy" ? "selected" : ""}>Sticky proxy sessions</option></select></label>
                <label><span>Enable Sticky Sessions</span><select name="sticky_sessions"><option value="true" ${uiScaling?.sticky_sessions ? "selected" : ""}>Enabled</option><option value="false" ${!uiScaling?.sticky_sessions ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Dashboard Replica Count</span><input name="dashboard_replicas" type="number" min="1" max="10" value="${escapeHtml(uiScaling?.dashboard_replicas || 2)}" /></label>
                <label><span>Proxy Container Name</span><input name="proxy_container_name" value="${escapeHtml(uiScaling?.proxy_container_name || "async-service-monitor-proxy")}" /></label>
                <label><span>Dashboard Container Prefix</span><input name="dashboard_container_prefix" value="${escapeHtml(uiScaling?.dashboard_container_prefix || "async-service-monitor-dashboard")}" /></label>
                <label><span>Proxy Port</span><input name="proxy_port" type="number" min="1" value="${escapeHtml(uiScaling?.proxy_port || 8000)}" /></label>
                <div class="guide-card">
                  <h4>Scaling Notes</h4>
                  <p>When enabled, the service provisions Docker-based dashboard replicas and a proxy automatically. Shared telemetry is required, and the portal will auto-generate a shared session secret if one is missing.</p>
                </div>
                <button type="submit">Save UI Scaling</button>
                <p class="form-status" id="ui-scaling-status"></p>
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
            </summary>
            <div class="accordion-body">
              <form id="portal-settings-form" class="check-form">
                <label><span>Portal Auth Enabled</span><select name="enabled"><option value="true" ${portalSettings?.enabled ? "selected" : ""}>Enabled</option><option value="false" ${!portalSettings?.enabled ? "selected" : ""}>Disabled</option></select></label>
                <label><span>Provider</span><select name="provider"><option value="basic" ${portalSettings?.provider === "basic" ? "selected" : ""}>Basic Auth</option><option value="oci" ${portalSettings?.provider === "oci" ? "selected" : ""}>OCI Auth</option></select></label>
                <label><span>Realm</span><input name="realm" value="${escapeHtml(portalSettings?.realm || "Async Service Monitor")}" /></label>
                <div class="guide-card">
                  <h4>Session Handling</h4>
                  <p>${portalSettings?.session_secret_configured ? "A shared signed session secret is configured for multi-container portal access." : "A shared session secret will be generated automatically when scaled UI mode is enabled."}</p>
                </div>
                <label><span>OCI Settings Enabled</span><select name="oci_enabled"><option value="true" ${portalSettings?.oci_enabled ? "selected" : ""}>Enabled</option><option value="false" ${!portalSettings?.oci_enabled ? "selected" : ""}>Disabled</option></select></label>
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
    </div>
  `;
}

function hydrateFormVisibility(form) {
  const type = form.querySelector("select[name='type']")?.value;
  if (!type) return;
  const requestLike = type === "http" || type === "auth" || type === "api";
  const showUrl = requestLike;
  const showHost = type === "dns" || type === "database" || type === "generic";
  const showPort = requestLike || type === "database" || type === "generic";
  const showStatuses = requestLike;
  const showContent = requestLike;
  const showDatabase = type === "database";
  form.querySelectorAll(".field-url").forEach((node) => node.classList.toggle("hidden", !showUrl));
  form.querySelectorAll(".field-host").forEach((node) => node.classList.toggle("hidden", !showHost));
  form.querySelectorAll(".field-port").forEach((node) => node.classList.toggle("hidden", !showPort));
  form.querySelectorAll(".field-statuses").forEach((node) => node.classList.toggle("hidden", !showStatuses));
  form.querySelectorAll(".field-content").forEach((node) => node.classList.toggle("hidden", !showContent));
  form.querySelectorAll(".request-like-only").forEach((node) => node.classList.toggle("hidden", !requestLike));
  const requestBodyMode = form.querySelector("select[name='request_body_mode']")?.value || "none";
  form.querySelectorAll(".builder-request-body").forEach((node) => {
    node.classList.toggle("hidden", !requestLike || requestBodyMode === "none");
  });
  form.querySelectorAll(".database-only").forEach((node) => node.classList.toggle("hidden", !showDatabase));
  const authType = form.querySelector("select[name='auth_type']")?.value || (type === "auth" ? "bearer" : "none");
  const placementMode = form.querySelector("select[name='placement_mode']")?.value || "auto";
  const showAuth = requestLike;
  form.querySelectorAll(".auth-only").forEach((node) => node.classList.toggle("hidden", !showAuth));
  form.querySelectorAll("[data-auth-field='token']").forEach((node) => node.classList.toggle("hidden", !showAuth || authType !== "bearer"));
  form.querySelectorAll("[data-auth-field='username'], [data-auth-field='password']").forEach((node) => node.classList.toggle("hidden", !showAuth || authType !== "basic"));
  form.querySelectorAll("[data-auth-field='header_name'], [data-auth-field='header_value']").forEach((node) => node.classList.toggle("hidden", !showAuth || authType !== "header"));
  form.querySelectorAll(".field-assigned-node").forEach((node) => node.classList.toggle("hidden", placementMode !== "specific"));
  const thresholdMode = form.querySelector("select[name='alert_threshold_mode']")?.value || "auto";
  form.querySelectorAll(".threshold-manual-fields").forEach((node) => node.classList.toggle("hidden", thresholdMode !== "manual"));
}

function alertThresholdPayload(formData) {
  return {
    mode: String(formData.get("alert_threshold_mode") || "auto"),
    availability_warning: Number(formData.get("availability_warning") || 99.5),
    availability_critical: Number(formData.get("availability_critical") || 99.0),
    error_rate_warning: Number(formData.get("error_rate_warning") || 2.0),
    error_rate_critical: Number(formData.get("error_rate_critical") || 5.0),
    p95_latency_warning_ms: Number(formData.get("p95_latency_warning_ms") || 1500.0),
    p95_latency_critical_ms: Number(formData.get("p95_latency_critical_ms") || 3000.0),
    p99_latency_warning_ms: Number(formData.get("p99_latency_warning_ms") || 2500.0),
    p99_latency_critical_ms: Number(formData.get("p99_latency_critical_ms") || 5000.0),
  };
}

function monitorFormPayload(form) {
  const formData = new FormData(form);
  const type = String(formData.get("type"));
  const requestLike = type === "http" || type === "auth" || type === "api";
  const authType = String(formData.get("auth_type") || (type === "auth" ? "bearer" : "none"));
  const placementMode = String(formData.get("placement_mode") || "auto");
  const portValue = String(formData.get("port") || "").trim();
  const databaseUsername = String(formData.get("database_username") || "").trim();
  const databasePassword = String(formData.get("database_password") || "");
  const requestHeaders = parseHeaderLines(
    formData.get("request_headers_text") || formData.get("request_headers") || ""
  );
  const expectedHeaders = parseExpectedHeaderLines(
    formData.get("expected_headers_text") || formData.get("expected_headers") || ""
  );
  return {
    id: form.dataset.originalId || null,
    name: String(formData.get("name")),
    type,
    enabled: String(formData.get("enabled")) === "true",
    interval_seconds: Number(formData.get("interval_seconds")),
    placement_mode: placementMode,
    assigned_node_id: placementMode === "specific" ? String(formData.get("assigned_node_id") || "") || null : null,
    timeout_seconds: formData.get("timeout_seconds") ? Number(formData.get("timeout_seconds")) : null,
    url: formData.get("url") || null,
    host: formData.get("host") || null,
    port: portValue ? Number(portValue) : null,
    database_name: String(formData.get("database_name") || "") || null,
    database_engine: String(formData.get("database_engine") || "mysql"),
    request_method: requestLike ? String(formData.get("request_method") || "GET") : "GET",
    request_headers: requestLike ? requestHeaders : [],
    request_body: requestLike ? String(formData.get("request_body") || "").trim() || null : null,
    request_body_mode: requestLike ? String(formData.get("request_body_mode") || "none") : "none",
    expected_statuses: requestLike ? parseCsv(formData.get("expected_statuses")).map(Number) : [200],
    expected_headers: requestLike ? expectedHeaders : [],
    max_response_time_ms:
      requestLike && formData.get("max_response_time_ms")
        ? Number(formData.get("max_response_time_ms"))
        : null,
    expect_authenticated_statuses: type === "auth" ? parseCsv(formData.get("expected_statuses")).map(Number) : [200],
    content: {
      contains: requestLike ? parseCsv(formData.get("contains")) : [],
      not_contains: requestLike ? parseCsv(formData.get("not_contains")) : [],
      regex: requestLike ? String(formData.get("regex") || "") || null : null,
    },
    retry: {
      attempts: Number(formData.get("retry_attempts") || 1),
      delay_seconds: Number(formData.get("retry_delay_seconds") || 0),
      retry_on_statuses: parseCsv(formData.get("retry_on_statuses") || "").map(Number),
      retry_on_timeout: String(formData.get("retry_on_timeout") || "true") === "true",
      retry_on_connection_error: String(formData.get("retry_on_connection_error") || "true") === "true",
    },
    alert_thresholds: alertThresholdPayload(formData),
    auth:
      requestLike && authType !== "none"
        ? {
            type: authType,
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

function browserMonitorPayload(form) {
  const formData = new FormData(form);
  const placementMode = String(formData.get("placement_mode") || "auto");
  const portValue = String(formData.get("port") || "").trim();
  const steps = Array.from(form.querySelectorAll("[data-browser-step]")).map((row, index) => ({
    name: String(row.querySelector("input[name='browser_step_name']")?.value || `Step ${index + 1}`),
    action: String(row.querySelector("select[name='browser_step_action']")?.value || "wait_for_selector"),
    selector: String(row.querySelector("input[name='browser_step_selector']")?.value || "").trim() || null,
    value: String(row.querySelector("input[name='browser_step_value']")?.value || "").trim() || null,
    timeout_seconds: row.querySelector("input[name='browser_step_timeout_seconds']")?.value
      ? Number(row.querySelector("input[name='browser_step_timeout_seconds']")?.value)
      : null,
  }));
  return {
    id: form.dataset.originalId || null,
    name: String(formData.get("name")),
    type: "browser",
    enabled: String(formData.get("enabled")) === "true",
    interval_seconds: Number(formData.get("interval_seconds")),
    placement_mode: placementMode,
    assigned_node_id: placementMode === "specific" ? String(formData.get("assigned_node_id") || "") || null : null,
    timeout_seconds: formData.get("timeout_seconds") ? Number(formData.get("timeout_seconds")) : null,
    url: String(formData.get("url") || "") || null,
    host: null,
    port: portValue ? Number(portValue) : null,
    database_name: null,
    database_engine: "postgresql",
    expected_statuses: [200],
    expect_authenticated_statuses: [200],
    auth: null,
    content: { contains: [], not_contains: [], regex: null },
    alert_thresholds: alertThresholdPayload(formData),
    browser: {
      expected_title_contains: String(formData.get("browser_expected_title_contains") || "").trim() || null,
      required_selectors: parseCsv(formData.get("browser_required_selectors") || ""),
      wait_until: String(formData.get("browser_wait_until") || "networkidle"),
      viewport_width: Number(formData.get("browser_viewport_width") || 1440),
      viewport_height: Number(formData.get("browser_viewport_height") || 900),
      persist_auth_session: String(formData.get("browser_persist_auth_session")) === "true" || formData.get("browser_persist_auth_session") === "on",
      storage_state: null,
      storage_state_captured_at: null,
      steps,
    },
  };
}

async function runMonitorTest(kind) {
  if (!hasRole("read_write")) return;
  const form = document.getElementById("monitor-form");
  if (!form) return;
  const payload = monitorFormPayload(form);
  const statusId = kind === "auth" ? "test-auth-status" : "monitor-form-status";
  const status = document.getElementById(statusId);
  try {
    setStatus(status, kind === "auth" ? "Testing authentication..." : "Testing monitor...");
    const result = await api(kind === "auth" ? "/api/checks/test-auth" : "/api/checks/test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (window.location.pathname === "/monitors/new/basic" && kind !== "auth") {
      state.basicMonitorBuilder.lastTestResult = result;
      const preview = document.querySelector(".monitor-builder-preview");
      if (preview) {
        preview.outerHTML = basicMonitorBuilderPreviewMarkup(result);
      }
      document.querySelectorAll(".builder-section-assertions").forEach((node) => {
        node.classList.remove("builder-locked");
      });
    }
    const prefix = result.success ? "Success" : "Failed";
    setStatus(status, `${prefix}: ${result.message} (${Math.round(Number(result.duration_ms || 0))} ms)`, !result.success);
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

function updateBrowserStepVisibility(row) {
  if (!row) return;
  const action = row.querySelector("select[name='browser_step_action']")?.value || "wait_for_selector";
  row.querySelectorAll(".browser-step-selector").forEach((node) => {
    node.classList.toggle("hidden", !["wait_for_selector", "click", "fill", "assert_text"].includes(action));
  });
  row.querySelectorAll(".browser-step-value").forEach((node) => {
    node.classList.toggle("hidden", !["fill", "press", "assert_text", "assert_url_contains", "wait_for_timeout", "navigate"].includes(action));
  });
}

function appendBrowserStep(step = {}) {
  const list = document.getElementById("browser-steps-list");
  if (!list) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = browserStepRowMarkup(step, list.querySelectorAll("[data-browser-step]").length);
  const row = wrapper.firstElementChild;
  list.appendChild(row);
  if (row instanceof HTMLDetailsElement) {
    row.open = true;
  }
  updateBrowserStepVisibility(row);
}

function applyNetworkFilters() {
  const rows = Array.from(document.querySelectorAll("#network-log-body tr[data-method]"));
  if (!rows.length) {
    return;
  }
  const filters = Object.fromEntries(
    Array.from(document.querySelectorAll("[data-network-filter]")).map((input) => [
      input.dataset.networkFilter,
      String(input.value || "").trim().toLowerCase(),
    ])
  );
  const durationMinRaw = document.querySelector("[data-network-filter-min='duration']")?.value || "";
  const durationMaxRaw = document.querySelector("[data-network-filter-max='duration']")?.value || "";
  const durationMin = durationMinRaw === "" ? null : Number(durationMinRaw);
  const durationMax = durationMaxRaw === "" ? null : Number(durationMaxRaw);
  let visible = 0;
  rows.forEach((row) => {
    const textMatches = Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      return String(row.dataset[key] || "").includes(value);
    });
    const durationValue = Number.parseFloat(String(row.dataset.duration || "").replace(/[^\d.]/g, ""));
    const minMatches = durationMin == null || (!Number.isNaN(durationValue) && durationValue >= durationMin);
    const maxMatches = durationMax == null || (!Number.isNaN(durationValue) && durationValue <= durationMax);
    const matches = textMatches && minMatches && maxMatches;
    row.classList.toggle("hidden", !matches);
    if (matches) visible += 1;
  });
  const count = document.getElementById("network-filter-count");
  if (count) {
    count.textContent = `${visible} of ${rows.length} requests shown`;
  }
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function runBrowserMonitorTest() {
  if (!hasRole("read_write")) return;
  const form = document.getElementById("browser-monitor-form");
  if (!form) return;
  const status = document.getElementById("browser-monitor-form-status");
  const results = document.getElementById("browser-test-results");
  try {
    setStatus(status, "Running browser monitor...");
    const result = await api("/api/checks/test", {
      method: "POST",
      body: JSON.stringify(browserMonitorPayload(form)),
    });
    state.browserMonitorBuilder.lastTestResult = result;
    if (results) {
      results.innerHTML = browserTestResultsMarkup(result);
    }
    const preview = document.getElementById("browser-builder-preview");
    if (preview) {
      preview.outerHTML = browserMonitorBuilderPreviewMarkup(result);
    }
    applyNetworkFilters();
    setStatus(
      status,
      `${result.success ? "Success" : "Failed"}: ${result.message} (${Math.round(Number(result.duration_ms || 0))} ms)`,
      !result.success
    );
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function runMonitorRecorderTest() {
  if (!hasRole("read_write")) return;
  const form = document.getElementById("monitor-recorder-form");
  if (!form) return;
  const status = document.getElementById("monitor-recorder-form-status");
  const results = document.getElementById("browser-test-results");
  try {
    setStatus(status, "Testing recorded browser monitor...");
    const payload = await hydrateRecorderStorageState(recorderMonitorPayload(form));
    const result = await api("/api/checks/test", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.recorder.lastTestResult = result;
    if (results) {
      results.innerHTML = browserTestResultsMarkup(result);
    }
    const preview = document.getElementById("recorder-builder-preview");
    if (preview) {
      preview.outerHTML = recorderBuilderPreviewMarkup();
    }
    applyNetworkFilters();
    setStatus(
      status,
      `${result.success ? "Success" : "Failed"}: ${result.message} (${Math.round(Number(result.duration_ms || 0))} ms)`,
      !result.success
    );
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

async function updateBrowserSessionState(clear = false) {
  if (!hasRole("read_write")) return;
  const form = document.getElementById("browser-monitor-form");
  if (!form || !form.dataset.originalName) return;
  const status = document.getElementById("browser-session-status");
  const textarea = form.querySelector("textarea[name='browser_storage_state']");
  try {
    setStatus(status, clear ? "Clearing stored browser session..." : "Updating stored browser session...");
    const result = await api(`/api/checks/${encodeURIComponent(form.dataset.originalName)}/browser-session`, {
      method: "PATCH",
      body: JSON.stringify({
        clear,
        storage_state: clear ? null : String(textarea?.value || "").trim() || null,
      }),
    });
    if (textarea && clear) {
      textarea.value = "";
    }
    setStatus(status, clear ? "Stored browser session cleared." : "Stored browser session updated.");
    await renderRoute();
  } catch (error) {
    setStatus(status, error.message, true);
  }
}

function peerFormPayload(form) {
  const formData = new FormData(form);
  return {
    node_id: String(formData.get("node_id")),
    base_url: String(formData.get("base_url")),
    enabled: String(formData.get("enabled")) === "true",
    container_name: formData.get("container_name") || null,
    monitor_scope: String(formData.get("monitor_scope") || "full"),
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

function uiScalingPayload(form) {
  const formData = new FormData(form);
  return {
    enabled: String(formData.get("enabled")) === "true",
    dashboard_replicas: Number(formData.get("dashboard_replicas") || 2),
    session_strategy: String(formData.get("session_strategy") || "shared_cookie"),
    sticky_sessions: String(formData.get("sticky_sessions")) === "true",
    proxy_container_name: String(formData.get("proxy_container_name") || "async-service-monitor-proxy"),
    dashboard_container_prefix: String(formData.get("dashboard_container_prefix") || "async-service-monitor-dashboard"),
    proxy_port: Number(formData.get("proxy_port") || 8000),
  };
}

function telemetryFormPayload(form) {
  const formData = new FormData(form);
  return {
    enabled: String(formData.get("enabled")) === "true",
    timeseries_provider: String(formData.get("timeseries_provider") || "local_postgresql"),
    timeseries_host: String(formData.get("timeseries_host") || "") || null,
    timeseries_port: Number(formData.get("timeseries_port") || 5432),
    timeseries_database: String(formData.get("timeseries_database") || "") || null,
    timeseries_username: String(formData.get("timeseries_username") || "") || null,
    timeseries_password: String(formData.get("timeseries_password") || "") || null,
    timeseries_use_ssl: String(formData.get("timeseries_use_ssl")) === "true",
    auto_provision_timeseries_local:
      String(formData.get("auto_provision_timeseries_local")) === "true",
    timeseries_local_container_name:
      String(formData.get("timeseries_local_container_name") || "") || "async-service-monitor-postgres",
    object_provider: String(formData.get("object_provider") || "local_minio"),
    object_endpoint: String(formData.get("object_endpoint") || "") || null,
    object_access_key: String(formData.get("object_access_key") || "") || null,
    object_secret_key: String(formData.get("object_secret_key") || "") || null,
    object_bucket: String(formData.get("object_bucket") || "") || "async-service-monitor",
    object_region: String(formData.get("object_region") || "") || null,
    object_use_ssl: String(formData.get("object_use_ssl")) === "true",
    auto_provision_object_local: String(formData.get("auto_provision_object_local")) === "true",
    object_local_container_name:
      String(formData.get("object_local_container_name") || "") || "async-service-monitor-minio",
    object_console_port: Number(formData.get("object_console_port") || 9001),
    retention_hours: Number(formData.get("retention_hours") || 2),
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

function hydrateTelemetrySettingsForm(form) {
  if (!form) return;
  const timeseriesProvider = form.querySelector("select[name='timeseries_provider']")?.value || "local_postgresql";
  const autoProvisionTimeseries =
    timeseriesProvider === "local_postgresql" &&
    form.querySelector("select[name='auto_provision_timeseries_local']")?.value === "true";
  const objectProvider = form.querySelector("select[name='object_provider']")?.value || "local_minio";
  const autoProvisionObject =
    objectProvider === "local_minio" &&
    form.querySelector("select[name='auto_provision_object_local']")?.value === "true";

  const setManagedState = (selector, disabled, message) => {
    form.querySelectorAll(selector).forEach((node) => {
      node.classList.toggle("managed-field", disabled);
      const input = node.querySelector("input, select, textarea");
      if (!input) return;
      if (disabled) {
        input.setAttribute("disabled", "disabled");
        input.setAttribute("title", message);
      } else {
        input.removeAttribute("disabled");
        input.removeAttribute("title");
      }
    });
  };

  if (autoProvisionTimeseries) {
    const defaults = {
      timeseries_host: "127.0.0.1",
      timeseries_port: "5432",
      timeseries_database: "async_service_monitor",
      timeseries_username: "asm_telemetry",
      timeseries_use_ssl: "false",
    };
    Object.entries(defaults).forEach(([name, value]) => {
      const field = form.querySelector(`[name='${name}']`);
      if (field && !field.value) {
        field.value = value;
      }
    });
  }

  if (autoProvisionObject) {
    const defaults = {
      object_endpoint: "http://127.0.0.1:9000",
      object_bucket: "async-service-monitor",
      object_access_key: "asm_minio",
      object_use_ssl: "false",
      object_region: "",
    };
    Object.entries(defaults).forEach(([name, value]) => {
      const field = form.querySelector(`[name='${name}']`);
      if (field && !field.value) {
        field.value = value;
      }
    });
  }

  setManagedState(
    "[data-telemetry-timeseries-managed]",
    autoProvisionTimeseries,
    "Provisioned automatically by the application."
  );
  setManagedState(
    "[data-telemetry-object-managed]",
    autoProvisionObject,
    "Provisioned automatically by the application."
  );

  const managedNote = form.querySelector("#telemetry-managed-note");
  if (managedNote) {
    const notes = [];
    if (autoProvisionTimeseries) {
      notes.push("The app will generate and wire in the local PostgreSQL connection settings.");
    }
    if (autoProvisionObject) {
      notes.push("The app will generate and wire in the local MinIO endpoint, bucket, and credentials.");
    }
    managedNote.textContent = notes.join(" ");
  }
}

function setStatus(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("error-text", isError);
}

function isInteractiveRoute(path = window.location.pathname) {
  return (
    path === "/monitors" ||
    path === "/configured-monitors" ||
    path === "/guide" ||
    path === "/monitors/new" ||
    path === "/monitors/new/basic" ||
    path === "/monitors/new/advanced" ||
    path === "/monitors/new/advanced/browser-health-monitor" ||
    path === "/monitors/new/advanced/real-user-monitoring" ||
    path === "/monitors/new/advanced/monitor-recorder" ||
    path.startsWith("/monitors/") ||
    path === "/profile" ||
    path === "/admin" ||
    path.startsWith("/admin/")
  );
}

async function renderRoute() {
  state.session = await api("/api/session");
  applyTheme();
  renderSessionChip();

  const path = window.location.pathname;
  if (path !== "/monitors/new/advanced/browser-health-monitor") {
    state.browserMonitorBuilder.lastTestResult = null;
  }
  if (path !== "/monitors/new/advanced/monitor-recorder") {
    const hasRecorderDraft =
      Boolean(state.recorder.targetUrl)
      || Boolean(state.recorder.steps.length)
      || Boolean(state.recorder.playwrightSessionId)
      || Boolean(state.recorder.fallbackSuggested);
    if (hasRecorderDraft) {
      await resetRecorderState();
    } else {
      stopPlaywrightRecorderPolling();
    }
  }
  if (state.session?.setup_required) {
    renderSidebar([], { available: false, containers: [] });
    renderBootstrapPage();
    return;
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

  if (path === "/") {
    const [checkMetrics, nodeMetrics, cluster] = await Promise.all([
      api("/api/metrics/checks"),
      api("/api/metrics/nodes"),
      api("/api/cluster"),
    ]);
    renderDashboard(overview, checks, summaryCounts, checkMetrics, nodeMetrics, cluster);
    hydratePlotlyCharts(document.getElementById("app-root"));
    return;
  }

  if (path === "/dashboards") {
    const [checkMetrics, recentResults] = await Promise.all([
      api("/api/metrics/checks"),
      api("/api/results?limit=200"),
    ]);
    renderDashboardsPage(checks, checkMetrics, recentResults);
    hydratePlotlyCharts(document.getElementById("app-root"));
    return;
  }

  if (path.startsWith("/dashboards/")) {
    const name = decodeURIComponent(path.split("/").pop());
    const searchParams = new URLSearchParams(window.location.search);
    const currentTab = searchParams.get("tab") || "overview";
    const currentRange = searchParams.get("range") || "24h";
    const customStart = searchParams.get("start");
    const customEnd = searchParams.get("end");
    const [check, checkMetrics, recentResults] = await Promise.all([
      api(`/api/checks/${encodeURIComponent(name)}`),
      api("/api/metrics/checks"),
      api("/api/results?limit=200"),
    ]);
    renderMonitorDashboardPage(
      check,
      checkMetrics,
      recentResults,
      currentTab,
      currentRange,
      customStart ? Number(customStart) : null,
      customEnd ? Number(customEnd) : null
    );
    hydratePlotlyCharts(document.getElementById("app-root"));
    return;
  }

  if (path === "/monitors") {
    const checkMetrics = await api("/api/metrics/checks");
    checks.forEach((check) => {
      check.metric_points = monitorPoints(check, checkMetrics);
    });
    renderMonitorsHomePage(checks);
    hydratePlotlyCharts(document.getElementById("app-root"));
    return;
  }

  if (path === "/configured-monitors") {
    if (!hasRole("read_write")) {
      navigate("/");
      return;
    }
    renderConfiguredMonitorsPage(checks);
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
    const [users, telemetry, portalSettings, emailSettings, uiScaling, cluster] = await Promise.all([
      api("/api/users"),
      api("/api/settings/telemetry"),
      api("/api/settings/portal"),
      api("/api/settings/email"),
      api("/api/settings/ui-scaling"),
      api("/api/cluster"),
    ]);
    renderAdminHomePage(users, telemetry, portalSettings, emailSettings, uiScaling, { ...cluster, containers: containersData });
    return;
  }

  if (path === "/admin/users") {
    if (!hasRole("admin")) {
      navigate("/");
      return;
    }
    const users = await api("/api/users");
    renderAdminUsersPage(users);
    return;
  }

  if (path === "/admin/config") {
    if (!hasRole("admin")) {
      navigate("/");
      return;
    }
    const [telemetry, portalSettings, emailSettings, uiScaling] = await Promise.all([
      api("/api/settings/telemetry"),
      api("/api/settings/portal"),
      api("/api/settings/email"),
      api("/api/settings/ui-scaling"),
    ]);
    renderAdminConfigPage(telemetry, portalSettings, emailSettings, uiScaling);
    hydrateTelemetrySettingsForm(document.getElementById("telemetry-form"));
    hydrateEmailSettingsForm(document.getElementById("email-settings-form"));
    return;
  }

  if (path === "/monitors/new") {
    renderAddMonitorHomePage();
    return;
  }

  if (path === "/monitors/new/advanced") {
    renderAdvancedMonitorHomePage();
    return;
  }

  if (path === "/monitors/new/advanced/browser-health-monitor") {
    const cluster = await api("/api/cluster");
    setWorkspaceHeader("Browser Health Monitor", "Create a synthetic browser journey with step validation and live network visibility.", [
      { label: "Monitors", href: "/monitors" },
      { label: "Add Monitor", href: "/monitors/new" },
      { label: "Advanced Monitor", href: "/monitors/new/advanced" },
      { label: "Browser Health Monitor" },
    ]);
    document.getElementById("app-root").innerHTML = browserMonitorBuilderMarkup(
      {
        name: "",
        type: "browser",
        enabled: true,
        interval_seconds: 300,
        placement_mode: "auto",
        assigned_node_id: null,
        timeout_seconds: 30,
        url: "",
        port: null,
        status: "unknown",
        metric_points: [],
        browser: {
          expected_title_contains: "",
          required_selectors: [],
          wait_until: "networkidle",
          viewport_width: 1440,
          viewport_height: 900,
          steps: [{ name: "Wait for main app", action: "wait_for_selector", selector: "body" }],
        },
      },
      "create",
      cluster,
      state.browserMonitorBuilder.lastTestResult
    );
    document.querySelectorAll("[data-browser-step]").forEach((row) => updateBrowserStepVisibility(row));
    applyNetworkFilters();
    if (!hasRole("read_write")) {
      disableForm(document.getElementById("browser-monitor-form"), true);
    }
    return;
  }

  if (path === "/monitors/new/advanced/real-user-monitoring") {
    setWorkspaceHeader("Real User Monitoring", "Plan and shape a future real user monitoring workflow using the same builder narrative as the other advanced monitors.", [
      { label: "Monitors", href: "/monitors" },
      { label: "Add Monitor", href: "/monitors/new" },
      { label: "Advanced Monitor", href: "/monitors/new/advanced" },
      { label: "Real User Monitoring" },
    ]);
    document.getElementById("app-root").innerHTML = realUserMonitoringBuilderMarkup();
    return;
  }

  if (path === "/monitors/new/advanced/monitor-recorder") {
    const cluster = await api("/api/cluster");
    if (!state.recorder.sessionId) {
      const session = await api("/api/recorder/session", { method: "POST" });
      state.recorder.sessionId = session.session_id;
    }
    renderMonitorRecorderPage(cluster);
    if (state.recorder.playwrightSessionId) {
      pollPlaywrightRecorderStatus().catch(() => {});
      startPlaywrightRecorderPolling();
    }
    return;
  }

  if (path === "/monitors/new/basic") {
    state.basicMonitorBuilder.lastTestResult = state.basicMonitorBuilder.lastTestResult || null;
    const cluster = await api("/api/cluster");
    setWorkspaceHeader("Basic Monitor", "Use the builder to define the request, test it, add assertions, and create the monitor.", [
      { label: "Monitors", href: "/monitors" },
      { label: "Add Monitor", href: "/monitors/new" },
      { label: "Basic Monitor" },
    ]);
    document.getElementById("app-root").innerHTML = basicMonitorBuilderMarkup(
      {
        name: "",
        type: "http",
        enabled: true,
        interval_seconds: 300,
        placement_mode: "auto",
        assigned_node_id: null,
        timeout_seconds: 10,
        url: "",
        host: "",
        port: null,
        request_method: "GET",
        request_headers: [],
        request_body: "",
        request_body_mode: "none",
        database_name: "",
        database_engine: "mysql",
        expected_statuses: [200],
        expected_headers: [],
        max_response_time_ms: null,
        retry: {
          attempts: 1,
          delay_seconds: 0,
          retry_on_statuses: [],
          retry_on_timeout: true,
          retry_on_connection_error: true,
        },
        content_rules: { contains: [], not_contains: [], regex: "" },
        alert_thresholds: defaultAlertThresholds(),
        auth: null,
      },
      cluster,
      state.basicMonitorBuilder.lastTestResult
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
    const [check, checkMetrics, cluster] = await Promise.all([
      api(`/api/checks/${encodeURIComponent(name)}`),
      api("/api/metrics/checks"),
      api("/api/cluster"),
    ]);
    check.metric_points = monitorPoints(check, checkMetrics);
    if (check.type === "browser") {
      setWorkspaceHeader(check.name, "Dedicated browser monitor page for editing synthetic steps and replaying network diagnostics.", [
        { label: "Monitors", href: "/monitors" },
        { label: "Configured Monitors", href: "/configured-monitors" },
        { label: check.name },
      ]);
      document.getElementById("app-root").innerHTML = browserMonitorBuilderMarkup(check, "edit", cluster, state.browserMonitorBuilder.lastTestResult);
      document.querySelectorAll("[data-browser-step]").forEach((row) => updateBrowserStepVisibility(row));
      applyNetworkFilters();
      hydratePlotlyCharts(document.getElementById("app-root"));
      if (!hasRole("read_write")) {
        disableForm(document.getElementById("browser-monitor-form"), true);
      }
      return;
    }
    setWorkspaceHeader(check.name, "Dedicated monitor page for editing, auth updates, and immediate re-checks.", [
      { label: "Monitors", href: "/monitors" },
      { label: "Configured Monitors", href: "/configured-monitors" },
      { label: check.name },
    ]);
    document.getElementById("app-root").innerHTML = monitorFormMarkup(check, "edit", cluster);
    const form = document.getElementById("monitor-form");
    hydrateFormVisibility(form);
    hydratePlotlyCharts(document.getElementById("app-root"));
    if (!hasRole("read_write")) {
      disableForm(form, true);
      setStatus(document.getElementById("monitor-form-status"), "Read-only access: editing is disabled for this account.");
    }
    return;
  }

  if (path === "/admin/cluster" || path === "/containers" || path === "/cluster/configure" || path === "/cluster") {
    const [peers, containers, nodeMetrics, cluster] = await Promise.all([
      api("/api/peers"),
      api("/api/containers"),
      api("/api/metrics/nodes"),
      api("/api/cluster"),
    ]);
    renderContainersPage(peers, containers, nodeMetrics, cluster);
    return;
  }

  if (path.startsWith("/admin/cluster/") || path.startsWith("/cluster/")) {
    const containerName = decodeURIComponent(path.split("/").pop());
    const [peers, containers, nodeMetrics] = await Promise.all([
      api("/api/peers"),
      api("/api/containers"),
      api("/api/metrics/nodes"),
    ]);
    const container = (containers.available ? containers.containers : []).find((item) => item.name === containerName);
    if (!container) {
      navigate("/admin/cluster");
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

function handleToggle(event) {
  const runDiagnosticPanel = event.target.closest("[data-run-diagnostic-key]");
  if (runDiagnosticPanel) {
    state.dashboardRunDiagnostics[runDiagnosticPanel.dataset.runDiagnosticKey] = runDiagnosticPanel.open;
    return;
  }
  const panel = event.target.closest("[data-dashboard-panel]");
  if (!panel) {
    return;
  }
  const panelName = panel.dataset.dashboardPanel;
  if (!panelName || !Object.prototype.hasOwnProperty.call(state.dashboardPanels, panelName)) {
    return;
  }
  state.dashboardPanels[panelName] = panel.open;
}

async function handleSubmit(event) {
  if (event.target.id === "browser-monitor-form") {
    event.preventDefault();
    if (!hasRole("read_write")) return;
    const form = event.target;
    const payload = browserMonitorPayload(form);
    const status = document.getElementById("browser-monitor-form-status");
    const originalName = form.dataset.originalName;
    try {
      setStatus(status, originalName ? "Saving browser monitor..." : "Creating browser monitor...");
      if (originalName) {
        await api(`/api/checks/${encodeURIComponent(originalName)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setStatus(status, "Browser monitor saved.");
        if (payload.name !== originalName) {
          navigate(`/monitors/${encodeURIComponent(payload.name)}`);
          return;
        }
      } else {
        await api("/api/checks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        navigate(`/monitors/${encodeURIComponent(payload.name)}`);
        return;
      }
      await renderRoute();
    } catch (error) {
      setStatus(status, error.message, true);
    }
    return;
  }

  if (event.target.id === "dashboard-custom-range-form") {
    event.preventDefault();
    const form = event.target;
    const checkName = form.dataset.checkName;
    const activeTab = form.dataset.tab || "overview";
    const formData = new FormData(form);
    const start = datetimeLocalToEpoch(String(formData.get("start") || ""));
    const end = datetimeLocalToEpoch(String(formData.get("end") || ""));
    if (start != null && end != null && start > end) {
      alert("Custom range start must be before the end time.");
      return;
    }
    const params = new URLSearchParams({ tab: activeTab, range: "custom" });
    if (start != null) params.set("start", String(start));
    if (end != null) params.set("end", String(end));
    navigate(`/dashboards/${encodeURIComponent(checkName)}?${params.toString()}`);
    return;
  }

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

  if (event.target.id === "bootstrap-form") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const status = document.getElementById("bootstrap-status");
    try {
      setStatus(status, "Creating administrator...");
      await api("/api/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username")),
          password: String(data.get("password")),
          first_name: String(data.get("first_name") || ""),
          last_name: String(data.get("last_name") || ""),
        }),
      });
      navigate("/");
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

  if (event.target.id === "ui-scaling-form") {
    event.preventDefault();
    if (!hasRole("admin")) return;
    const form = event.target;
    const status = document.getElementById("ui-scaling-status");
    try {
      setStatus(status, "Saving UI scaling settings...");
      const result = await api("/api/settings/ui-scaling", {
        method: "PUT",
        body: JSON.stringify(uiScalingPayload(form)),
      });
      setStatus(status, result.message || "UI scaling settings saved.");
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
    const isNew = window.location.pathname === "/monitors/new/basic";
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
          container_name: String(data.get("container_name") || "") || null,
          monitor_scope: String(data.get("monitor_scope") || "full"),
          image: null,
          base_url: null,
          network: null,
          host_port: null,
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

  if (event.target.id === "monitor-recorder-form") {
    event.preventDefault();
    if (!hasRole("read_write")) return;
    const form = event.target;
    const status = document.getElementById("monitor-recorder-form-status");
    try {
      setStatus(status, "Saving recorded browser monitor...");
      const payload = await hydrateRecorderStorageState(recorderMonitorPayload(form));
      await api("/api/checks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await resetRecorderState();
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

  const helpDiagramTrigger = event.target.closest("[data-help-diagram-src]");
  if (helpDiagramTrigger) {
    event.preventDefault();
    openHelpDiagramLightbox(
      helpDiagramTrigger.dataset.helpDiagramSrc,
      helpDiagramTrigger.dataset.helpDiagramAlt || "",
      helpDiagramTrigger.dataset.helpDiagramTitle || "Diagram"
    );
    return;
  }

  if (event.target.closest("[data-help-diagram-close]")) {
    event.preventDefault();
    closeHelpDiagramLightbox();
    return;
  }

  if (event.target.id === "bulk-enable-btn") {
    await runBulkMonitorAction("enable");
    return;
  }

  if (event.target.id === "bulk-disable-btn") {
    await runBulkMonitorAction("disable");
    return;
  }

  if (event.target.id === "bulk-delete-btn") {
    await runBulkMonitorAction("delete");
    return;
  }

  if (event.target.id === "logout-btn") {
    await api("/api/auth/logout", { method: "POST" });
    navigate("/");
    return;
  }

  if (event.target.id === "test-monitor-btn") {
    await runMonitorTest("monitor");
    return;
  }

  if (event.target.id === "test-browser-monitor-btn") {
    await runBrowserMonitorTest();
    return;
  }

  const harDownload = event.target.closest("[data-download-har]");
  if (harDownload) {
    const context = state.dashboardDetailContext;
    const check = context?.check;
    const results = context?.recentResults || [];
    const result = results.find((item) => runDiagnosticKey(check, item) === harDownload.dataset.downloadHar);
    if (!check || !result || check.type !== "browser") return;
    downloadJsonFile(
      `${check.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-${Math.floor(Number(result.timestamp || Date.now() / 1000))}.har`,
      browserResultToHar(check, result)
    );
    return;
  }

  if (event.target.id === "update-browser-session-btn") {
    await updateBrowserSessionState(false);
    return;
  }

  if (event.target.id === "clear-browser-session-btn") {
    await updateBrowserSessionState(true);
    return;
  }

  if (event.target.id === "start-monitor-recorder-btn") {
    if (!hasRole("read_write")) return;
    const url = document.getElementById("monitor-recorder-url")?.value?.trim() || "";
    if (!url) {
      setStatus(document.getElementById("monitor-recorder-status"), "Enter a URL to start recording.", true);
      return;
    }
    await teardownPlaywrightRecorder(true);
    if (!state.recorder.sessionId) {
      const session = await api("/api/recorder/session", { method: "POST" });
      state.recorder.sessionId = session.session_id;
    }
    state.recorder.targetUrl = url;
    state.recorder.steps = [];
    state.recorder.lastPageUrl = url;
    state.recorder.lastTestResult = null;
    clearPlaywrightFallback();
    renderRecorderSteps();
    updateRecorderFrame();
    return;
  }

  if (event.target.id === "use-playwright-recorder-btn") {
    if (!hasRole("read_write")) return;
    const url = document.getElementById("monitor-recorder-url")?.value?.trim() || state.recorder.targetUrl || "";
    if (!url) {
      setStatus(document.getElementById("monitor-recorder-status"), "Enter a URL before launching Chromium recorder.", true);
      return;
    }
    state.recorder.lastTestResult = null;
    await launchPlaywrightRecorder(url);
    setStatus(document.getElementById("monitor-recorder-status"), "Chromium recorder launched.");
    return;
  }

  if (event.target.id === "stop-playwright-recorder-btn") {
    if (!hasRole("read_write")) return;
    await teardownPlaywrightRecorder(true);
    refreshRecorderUi();
    setStatus(document.getElementById("monitor-recorder-status"), "Chromium recorder stopped.");
    return;
  }

  if (event.target.id === "clear-monitor-recorder-btn") {
    state.recorder.steps = [];
    state.recorder.lastTestResult = null;
    renderRecorderSteps();
    setStatus(document.getElementById("monitor-recorder-status"), "Recorded steps cleared.");
    return;
  }

  if (event.target.id === "test-monitor-recorder-btn") {
    await runMonitorRecorderTest();
    return;
  }

  if (event.target.id === "test-auth-btn") {
    await runMonitorTest("auth");
    return;
  }

  if (event.target.id === "add-browser-step-btn") {
    appendBrowserStep();
    return;
  }

  if (event.target.id === "clear-network-filters-btn") {
    document.querySelectorAll("[data-network-filter], [data-network-filter-min], [data-network-filter-max]").forEach((input) => {
      input.value = "";
    });
    applyNetworkFilters();
    return;
  }

  if (event.target.id === "export-incident-timeline-btn") {
    const context = state.dashboardDetailContext;
    if (!context?.check) return;
    downloadJsonFile(
      `${context.check.name.replaceAll(" ", "-").toLowerCase()}-incident-timeline.json`,
      {
        monitor: context.check.name,
        exported_at: new Date().toISOString(),
        failures: context.failures || [],
        history_points: context.points || [],
      }
    );
    return;
  }

  if (event.target.id === "help-search-clear") {
    state.helpWorkspace.query = "";
    renderGuidePage();
    return;
  }

  const removeBrowserStep = event.target.closest("[data-remove-browser-step]");
  if (removeBrowserStep) {
    removeBrowserStep.closest("[data-browser-step]")?.remove();
    return;
  }

  const removeRecorderStep = event.target.closest("[data-remove-recorder-step]");
  if (removeRecorderStep) {
    const index = Number(removeRecorderStep.dataset.removeRecorderStep);
    state.recorder.steps.splice(index, 1);
    renderRecorderSteps();
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

  if (event.target.id === "toggle-browser-monitor-btn") {
    if (!hasRole("read_write")) return;
    const form = document.getElementById("browser-monitor-form");
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

  if (event.target.id === "delete-browser-monitor-btn") {
    if (!hasRole("read_write")) return;
    const form = document.getElementById("browser-monitor-form");
    const originalName = form.dataset.originalName;
    if (!window.confirm(`Delete monitor "${originalName}"?`)) return;
    await api(`/api/checks/${encodeURIComponent(originalName)}`, { method: "DELETE" });
    navigate("/monitors");
    return;
  }

  if (event.target.id === "abandon-monitor-builder-btn") {
    state.basicMonitorBuilder.lastTestResult = null;
    navigate("/monitors/new");
    return;
  }

  if (event.target.id === "abandon-browser-builder-btn") {
    state.browserMonitorBuilder.lastTestResult = null;
    navigate("/monitors/new/advanced");
    return;
  }

  if (event.target.id === "abandon-rum-builder-btn") {
    navigate("/monitors/new/advanced");
    return;
  }

  if (event.target.id === "abandon-recorder-builder-btn") {
    await resetRecorderState();
    navigate("/monitors/new/advanced");
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
  if (
    event.target.id === "dashboards-status-filter" ||
    event.target.id === "dashboards-type-filter"
  ) {
    if (event.target.id === "dashboards-status-filter") {
      state.dashboardWorkspace.status = event.target.value || "all";
    }
    if (event.target.id === "dashboards-type-filter") {
      state.dashboardWorkspace.type = event.target.value || "all";
    }
    renderRoute().catch((error) => alert(error.message));
    return;
  }

  if (
    event.target.id === "configured-monitors-type-filter" ||
    event.target.id === "configured-monitors-enabled-filter"
  ) {
    updateConfiguredMonitorsFilters(event);
    renderRoute().catch((error) => alert(error.message));
    return;
  }

  if (event.target.id === "configured-monitors-select-all") {
    document.querySelectorAll(".monitor-bulk-checkbox").forEach((node) => {
      node.checked = event.target.checked;
    });
    updateConfiguredMonitorSelection();
    return;
  }

  if (event.target.matches(".monitor-bulk-checkbox")) {
    updateConfiguredMonitorSelection();
    return;
  }

  if (
    event.target.matches("select[name='type'], select[name='auth_type'], select[name='alert_threshold_mode'], #monitor-form select[name='placement_mode'], #monitor-form select[name='request_body_mode']")
  ) {
    hydrateFormVisibility(event.target.closest("form"));
    if (event.target.closest("#monitor-form") && window.location.pathname === "/monitors/new/basic") {
      state.basicMonitorBuilder.lastTestResult = null;
      const preview = document.querySelector(".monitor-builder-preview");
      if (preview) {
        preview.outerHTML = basicMonitorBuilderPreviewMarkup(null);
      }
      document.querySelectorAll(".builder-section-assertions").forEach((node) => {
        node.classList.add("builder-locked");
      });
    }
    return;
  }

  if (
    event.target.matches("#browser-monitor-form select[name='placement_mode']") ||
    event.target.matches("#monitor-recorder-form select[name='placement_mode']") ||
    event.target.matches("select[name='browser_step_action']")
  ) {
    if (
      event.target.matches("#browser-monitor-form select[name='placement_mode']") ||
      event.target.matches("#monitor-recorder-form select[name='placement_mode']")
    ) {
      const form = event.target.closest("form");
      const placementMode = event.target.value || "auto";
      form.querySelectorAll(".field-assigned-node").forEach((node) => {
        node.classList.toggle("hidden", placementMode !== "specific");
      });
    }
    if (event.target.matches("select[name='browser_step_action']")) {
      updateBrowserStepVisibility(event.target.closest("[data-browser-step]"));
    }
    return;
  }

  if (
    event.target.matches("[data-network-filter]") ||
    event.target.matches("[data-network-filter-min]") ||
    event.target.matches("[data-network-filter-max]")
  ) {
    applyNetworkFilters();
    return;
  }

  if (
    event.target.matches("#telemetry-form select[name='timeseries_provider']") ||
    event.target.matches("#telemetry-form select[name='auto_provision_timeseries_local']") ||
    event.target.matches("#telemetry-form select[name='object_provider']") ||
    event.target.matches("#telemetry-form select[name='auto_provision_object_local']")
  ) {
    hydrateTelemetrySettingsForm(event.target.closest("form"));
    return;
  }

  if (
    event.target.matches("#email-settings-form select[name='provider']") ||
    event.target.matches("#email-settings-form select[name='auto_provision_local']")
  ) {
    hydrateEmailSettingsForm(event.target.closest("form"));
  }
}

function handleInput(event) {
  if (event.target.id === "help-search") {
    state.helpWorkspace.query = event.target.value || "";
    renderGuidePage();
    const nextInput = document.getElementById("help-search");
    if (nextInput) {
      nextInput.focus();
      const cursor = state.helpWorkspace.query.length;
      nextInput.setSelectionRange(cursor, cursor);
    }
    return;
  }

  if (event.target.id === "dashboards-search") {
    state.dashboardWorkspace.query = event.target.value || "";
    renderRoute().catch((error) => alert(error.message));
    return;
  }

  if (
    event.target.matches("[data-network-filter]") ||
    event.target.matches("[data-network-filter-min]") ||
    event.target.matches("[data-network-filter-max]")
  ) {
    applyNetworkFilters();
    return;
  }

  if (event.target.id === "configured-monitors-search") {
    updateConfiguredMonitorsFilters(event);
    renderRoute().catch((error) => alert(error.message));
    return;
  }

  if (window.location.pathname === "/monitors/new/basic" && event.target.closest("#monitor-form")) {
    state.basicMonitorBuilder.lastTestResult = null;
    const preview = document.querySelector(".monitor-builder-preview");
    if (preview) {
      preview.outerHTML = basicMonitorBuilderPreviewMarkup(null);
    }
  }

  if (event.target.id === "monitor-recorder-url") {
    state.recorder.targetUrl = event.target.value || "";
  }
}

function handleWindowMessage(event) {
  const payload = event.data;
  if (!payload || payload.source !== "asm-recorder") return;

  if (payload.event === "navigate" || payload.event === "page_ready") {
    state.recorder.lastPageUrl = payload.url || state.recorder.lastPageUrl;
    const pageLabel = document.getElementById("monitor-recorder-page-label");
    if (pageLabel) {
      pageLabel.textContent = state.recorder.lastPageUrl || "No page loaded";
    }
    if (!state.recorder.steps.length || state.recorder.steps[state.recorder.steps.length - 1]?.url !== payload.url) {
      state.recorder.steps.push({
        event: "navigate",
        url: payload.url || "",
        title: payload.title || "",
      });
      renderRecorderSteps();
    }
    const blockedReason = recorderBlockedReason(payload);
    if (blockedReason) {
      suggestPlaywrightFallback(blockedReason);
      setStatus(document.getElementById("monitor-recorder-status"), blockedReason, true);
    }
    return;
  }

  if (payload.event === "click" || payload.event === "fill" || payload.event === "submit") {
    state.recorder.steps.push({
      event: payload.event,
      selector: payload.selector || null,
      value: payload.value || null,
      url: payload.href || payload.action || null,
      title: payload.text || null,
      method: payload.method || null,
    });
    renderRecorderSteps();
    clearPlaywrightFallback();
    setStatus(document.getElementById("monitor-recorder-status"), `Captured ${payload.event} action.`);
    return;
  }

  if (payload.event === "proxy_error") {
    const message = payload.message || "Recorder proxy failed.";
    suggestPlaywrightFallback(recorderBlockedReason(payload) || "The embedded recorder hit an error. Chromium recorder may work better for this site.");
    setStatus(document.getElementById("monitor-recorder-status"), message, true);
  }
}

function boot() {
  document.addEventListener("click", (event) => handleClick(event).catch((error) => alert(error.message)));
  document.addEventListener("submit", (event) => handleSubmit(event).catch((error) => alert(error.message)));
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("toggle", handleToggle, true);
  window.addEventListener("message", handleWindowMessage);
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
