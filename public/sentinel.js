// CONFIG
const API = "/api/backend";
const SVCS = [
  "storefront-ui",
  "api-gateway",
  "auth-service",
  "payments-api",
  "payments-db",
  "order-service",
  "cache-service",
  "user-service",
  "notification-svc",
];
const CLR = {
  "storefront-ui": "#00e5ff",
  "api-gateway": "#8b5cf6",
  "auth-service": "#aaff00",
  "payments-api": "#ffb800",
  "payments-db": "#ff4d00",
  "order-service": "#a78bfa",
  "cache-service": "#06b6d4",
  "user-service": "#84cc16",
  "notification-svc": "#f97316",
};
const MAX_PTS = 40;

// STATE
let incidents = [];
let totalConf = 0;
let confN = 0;
let incBadgeN = 0;
let sevCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
let ftCounts = {};
let trainRunning = false;
let rewardSeries = { easy: [], medium: [], hard: [] };
let compSeries = { rc: [], action: [], severity: [], comm: [], speed: [] };
let chalSeries = [];
let speedSeries = [];
let simTick = 0;
let faultActive = false;
let faultType = "";
let faultSvc = "";
let backendMode = false;
let backendTask = "easy";
let backendObs = null;
let backendLastAction = null;
let backendPollTimer = null;
let backendLastEpisodeId = null;
let backendPollDelayMs = 2500;
const BACKEND_POLL_MIN_MS = 2500;
const BACKEND_POLL_MAX_MS = 10000;

let trainStatusPollTimer = null;
let trainStatusPollDelayMs = 1500;
const TRAIN_STATUS_POLL_MIN_MS = 1500;
const TRAIN_STATUS_POLL_MAX_MS = 10000;

// CLOCK
setInterval(() => {
  const clock = document.getElementById("clock");
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString();
  }
}, 1000);

// TAB NAVIGATION
function showTab(id, btn) {
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  const target = document.getElementById("tab-" + id);
  if (target) target.classList.add("active");
  if (btn) btn.classList.add("active");
  if (id === "incidents") renderIncidentList();
  if (id === "reports") renderReports();
}

// CHART FACTORY
const C = { mono: "JetBrains Mono", grid: "rgba(255,255,255,.16)", tick: "#f3f3f3" };
const MULTI_COLORS = ["#00e5ff", "#8b5cf6", "#aaff00", "#ffb800", "#ff4d00", "#22d3ee", "#f97316", "#ec4899"];
function baseOpts(yMin = 0, yMax = 1, cb = null) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: C.grid },
        ticks: { color: C.tick, font: { family: C.mono, size: 9 }, maxTicksLimit: 6 },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: { color: C.grid },
        ticks: {
          color: C.tick,
          font: { family: C.mono, size: 9 },
          callback: cb || ((v) => (yMax <= 1 ? (v * 100).toFixed(0) + "%" : v)),
        },
      },
    },
  };
}
function mkLine(id, datasets, opts) {
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return null;
  return new Chart(ctx, { type: "line", data: { labels: [], datasets }, options: opts || baseOpts() });
}
function mkBar(id, datasets, opts) {
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return null;
  return new Chart(ctx, { type: "bar", data: { labels: [], datasets }, options: opts || baseOpts() });
}
function mkDoughnut(id, datasets, labels) {
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return null;
  return new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: "#ffffff", font: { family: C.mono, size: 9 }, boxWidth: 10 } },
      },
    },
  });
}

const cpuC = mkLine(
  "cpuChart",
  SVCS.slice(0, 5).map((s) => ({
    label: s,
    data: [],
    borderColor: CLR[s],
    borderWidth: 1.5,
    tension: 0.4,
    pointRadius: 0,
    fill: false,
  })),
  baseOpts(0, 1)
);
const memC = mkLine(
  "memChart",
  SVCS.slice(0, 5).map((s) => ({
    label: s,
    data: [],
    borderColor: CLR[s],
    borderWidth: 1.5,
    tension: 0.4,
    pointRadius: 0,
    fill: false,
  })),
  baseOpts(0, 1)
);
const rtC = mkLine(
  "rtChart",
  SVCS.slice(0, 5).map((s) => ({
    label: s,
    data: [],
    borderColor: CLR[s],
    borderWidth: 1.5,
    tension: 0.4,
    pointRadius: 0,
    fill: false,
  })),
  baseOpts(0, null, (v) => v + "ms")
);

const rewC = mkLine(
  "rewardChart",
  [
    { label: "Easy", data: [], borderColor: "#aaff00", borderWidth: 2, tension: 0.5, pointRadius: 0, fill: false },
    { label: "Medium", data: [], borderColor: "#ffb800", borderWidth: 2, tension: 0.5, pointRadius: 0, fill: false },
    { label: "Hard", data: [], borderColor: "#ff4d00", borderWidth: 2, tension: 0.5, pointRadius: 0, fill: false },
  ],
  {
    ...baseOpts(0, 1),
    plugins: { legend: { display: true, labels: { color: "#ffffff", font: { family: C.mono, size: 10 }, boxWidth: 10 } } },
  }
);

const comC = mkLine(
  "componentChart",
  [
    { label: "Root Cause", data: [], borderColor: "#00e5ff", borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: false },
    { label: "Action", data: [], borderColor: "#8b5cf6", borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: false },
    { label: "Severity", data: [], borderColor: "#aaff00", borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: false },
    { label: "Comms", data: [], borderColor: "#ffb800", borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: false },
    { label: "Speed", data: [], borderColor: "#f97316", borderWidth: 1.5, tension: 0.4, pointRadius: 0, fill: false },
  ],
  {
    ...baseOpts(0, 1),
    plugins: { legend: { display: true, labels: { color: "#ffffff", font: { family: C.mono, size: 10 }, boxWidth: 10 } } },
  }
);

const rcC = mkLine(
  "rcChart",
  [
    {
      label: "RC Accuracy",
      data: [],
      borderColor: "#00e5ff",
      borderWidth: 1.5,
      tension: 0.4,
      pointRadius: 0,
      fill: true,
      backgroundColor: "rgba(0,229,255,.06)",
    },
  ],
  baseOpts(0, 1)
);
const chalC = mkBar(
  "chalChart",
  [{ label: "Challenger Win%", data: [], backgroundColor: "rgba(139,92,246,.55)", borderColor: "#8b5cf6", borderWidth: 1 }],
  baseOpts(0, 1)
);
const spdC = mkLine(
  "speedChart",
  [
    {
      label: "Speed Bonus",
      data: [],
      borderColor: "#f97316",
      borderWidth: 1.5,
      tension: 0.4,
      pointRadius: 0,
      fill: true,
      backgroundColor: "rgba(249,115,22,.06)",
    },
  ],
  baseOpts(0, 1)
);

const sevC = mkDoughnut(
  "sevChart",
  [
    {
      data: [0, 0, 0, 0],
      backgroundColor: ["rgba(255,77,0,.7)", "rgba(255,184,0,.7)", "rgba(0,229,255,.6)", "rgba(74,96,128,.4)"],
      borderColor: ["#ff4d00", "#ffb800", "#00e5ff", "#4a6080"],
      borderWidth: 1,
    },
  ],
  ["P0", "P1", "P2", "P3"]
);
const ftC = mkBar(
  "ftChart",
  [{ data: [], backgroundColor: [], borderColor: [], borderWidth: 1 }],
  { ...baseOpts(0, null, (v) => v), indexAxis: "y", plugins: { legend: { display: false } } }
);

function renderSvcGrid(metrics) {
  const g = document.getElementById("svcGrid");
  if (!g) return;
  g.innerHTML = "";
  for (const [svc, m] of Object.entries(metrics)) {
    const st = m.status || "healthy";
    const cpu = (m.cpu_utilization * 100).toFixed(0);
    const mem = (m.memory_utilization * 100).toFixed(0);
    const clr = st === "healthy" ? "var(--volt)" : st === "degraded" ? "var(--amber)" : "var(--fire)";
    const tc = CLR[svc] || "var(--electric)";
    g.innerHTML += `
    <div class="svc">
      <div class="svc-accent" style="background:${tc}"></div>
      <div class="svc-name" style="color:${tc}">${svc}</div>
      <div class="svc-row">
        <span style="font-size:9px;color:var(--muted)">CPU</span>
        <div class="svc-bar-track"><div class="svc-bar-fill" style="width:${cpu}%;background:${clr}"></div></div>
        <span style="font-family:var(--mono);font-size:10px;margin-left:6px">${cpu}%</span>
      </div>
      <div class="svc-row">
        <span style="font-size:9px;color:var(--muted)">MEM</span>
        <div class="svc-bar-track"><div class="svc-bar-fill" style="width:${mem}%;background:${clr}"></div></div>
        <span style="font-family:var(--mono);font-size:10px;margin-left:6px">${mem}%</span>
      </div>
      <div class="svc-status clr-${st}">${st.toUpperCase()}</div>
    </div>`;
  }
}

function pushMonitorMetric(chart, label, metrics, key) {
  if (!chart) return;
  if (chart.data.labels.length > MAX_PTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((d) => d.data.shift());
  }
  chart.data.labels.push(label);
  chart.data.datasets.forEach((d) => {
    const m = metrics[d.label];
    if (m) d.data.push(m[key] || 0);
  });
  chart.update("none");
}

function renderAlerts(alerts) {
  const kpiAlerts = document.getElementById("kpiAlerts");
  const alertCnt = document.getElementById("alertCnt");
  const kpiAlertSub = document.getElementById("kpiAlertSub");
  if (kpiAlerts) kpiAlerts.textContent = alerts.length;
  if (alertCnt) alertCnt.textContent = alerts.length + " alerts";
  if (kpiAlertSub) kpiAlertSub.textContent = alerts.length ? "active incidents" : "system nominal";
  if (!alerts.length) return;
  const feed = document.getElementById("alertFeed");
  if (!feed) return;
  alerts.slice(0, 6).forEach((a) => {
    const div = document.createElement("div");
    div.className = "alert-item " + a.severity;
    div.innerHTML = `
      <div class="alert-top">
        <span class="alert-svc">${a.service}</span>
        <span class="alert-badge badge-${a.severity === "critical" ? "crit" : "warn"}">${a.severity}</span>
      </div>
      <div class="alert-meta">${a.metric}: ${typeof a.current_value === "number" ? a.current_value.toFixed(3) : a.current_value} / threshold: ${a.threshold}</div>`;
    feed.insertBefore(div, feed.firstChild);
    while (feed.children.length > 18) feed.removeChild(feed.lastChild);
  });
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    cache: "no-store",
    ...options,
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${path}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function inferActionFromObservation(obs) {
  const metrics = obs?.metrics || {};
  const services = Object.entries(metrics);
  if (!services.length) {
    return {
      root_cause_service: "api-gateway",
      root_cause_type: "unknown",
      severity: "P2",
      affected_services: ["api-gateway"],
      remediation_action: "investigate_further",
      stakeholder_message: "Investigating degraded services and collecting evidence.",
      confidence: 0.25,
      reasoning: "Insufficient evidence in current observation.",
    };
  }

  const scored = services
    .map(([name, m]) => {
      const cpu = Number(m.cpu_utilization || 0);
      const mem = Number(m.memory_utilization || 0);
      const rt = Number(m.http_rt || m.consumer_rpc_rt || 0);
      const unhealthyPenalty = m.is_healthy ? 0 : 0.4;
      const score = cpu * 0.35 + mem * 0.45 + Math.min(rt / 3000, 1) * 0.2 + unhealthyPenalty;
      return { name, cpu, mem, rt, status: m.status || "healthy", score };
    })
    .sort((a, b) => b.score - a.score);

  const root = scored[0];
  const affected = scored.filter((s) => s.status !== "healthy" || s.score > 0.45).map((s) => s.name);

  let rootType = "misconfiguration";
  let remediation = "fix_config";
  if (root.mem > 0.88) {
    rootType = "memory_leak";
    remediation = "restart_service";
  } else if (root.rt > 1200) {
    rootType = "dependency_failure";
    remediation = "reroute_traffic";
  } else if (root.cpu > 0.9) {
    rootType = "resource_exhaustion";
    remediation = "scale_up";
  }

  const unhealthyCount = scored.filter((s) => s.status !== "healthy").length;
  const severity = unhealthyCount >= 3 || root.score > 1.1 ? "P0" : unhealthyCount >= 1 || root.score > 0.75 ? "P1" : "P2";
  const confidence = Math.max(0.35, Math.min(0.95, root.score / 1.4));

  return {
    root_cause_service: root.name,
    root_cause_type: rootType,
    severity,
    affected_services: affected.length ? affected : [root.name],
    remediation_action: remediation,
    stakeholder_message:
      severity === "P0" || severity === "P1"
        ? `[${severity}] ${root.name} degraded (${rootType}). Impacted services: ${affected.length || 1}. Action: ${remediation}.`
        : "Issue under investigation.",
    confidence: parseFloat(confidence.toFixed(2)),
    reasoning: `Highest degradation score detected on ${root.name} based on CPU/MEM/latency and health status.`,
  };
}

function incidentFromBackendResult(result, action) {
  const info = result?.info || {};
  const breakdown = info.reward_breakdown || {};
  const analysis = {
    root_cause_service: action.root_cause_service,
    root_cause_type: action.root_cause_type,
    severity: action.severity,
    affected_services: action.affected_services || [],
    confidence: action.confidence || 0.5,
    reasoning: action.reasoning || breakdown.feedback || "Automated triage result.",
    stakeholder_message: action.stakeholder_message || "",
  };

  return {
    id: info.episode_id || `INC-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    analysis,
    remediation: {
      action: action.remediation_action,
      status: "suggested",
      requires_approval: false,
      message: `Backend scored this episode at reward=${(result.reward || 0).toFixed(3)}`,
      runbook: [
        `Validate root cause service: ${action.root_cause_service}`,
        `Execute remediation action: ${action.remediation_action}`,
        "Confirm alert reduction and service health recovery",
      ],
    },
    agents: info.multi_agent_workflow || [
      { tier: "L1 Triage Agent", task: "Initial Triage & Topology Mapping", output: `Detected cascade across ${action.affected_services?.length || 1} services. Assigned severity: ${action.severity}`, color: "var(--electric)" },
      { tier: "L2 Diagnostic Agent", task: "Root Cause Analysis", output: `Diagnosed root cause as ${action.root_cause_service} (${action.root_cause_type}). Confidence: ${((action.confidence||0)*100).toFixed(0)}%.`, color: "var(--purple)" },
      { tier: "L3 Remediation Agent", task: "Runbook Generation", output: `Proposed remediation: ${(action.remediation_action||"").replace(/_/g, " ")}.`, color: "var(--volt)" }
    ],
  };
}

function applyBackendObservation(obs) {
  if (!obs) return;

  const metrics = obs.metrics || {};
  const alerts = obs.alerts || [];
  const ts = new Date().toLocaleTimeString();

  renderSvcGrid(metrics);
  const healthy = Object.values(metrics).filter((m) => m.is_healthy).length;
  const total = Object.keys(metrics).length || SVCS.length;
  const kpiHealthy = document.getElementById("kpiHealthy");
  if (kpiHealthy) kpiHealthy.textContent = String(healthy);
  const kpiTotal = document.getElementById("kpiTotal");
  if (kpiTotal) kpiTotal.textContent = String(total);
  const svcTime = document.getElementById("svcTime");
  if (svcTime) svcTime.textContent = ts;

  pushMonitorMetric(cpuC, ts, metrics, "cpu_utilization");
  pushMonitorMetric(memC, ts, metrics, "memory_utilization");
  pushMonitorMetric(rtC, ts, metrics, "http_rt");

  const feed = document.getElementById("alertFeed");
  if (feed) {
    feed.innerHTML = '<div class="text-muted" style="text-align:center;padding:24px;font-size:11px">System nominal - no alerts</div>';
  }
  renderAlerts(alerts);
}

async function backendReset(taskId = backendTask) {
  const response = await apiJson("/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, dynamic: true }),
  });

  backendObs = response.observation || null;
  backendLastAction = null;
  backendTask = taskId;
  backendLastEpisodeId = backendObs?.episode_id || null;
  applyBackendObservation(backendObs);
}

async function backendTick() {
  if (!backendObs) {
    await backendReset(backendTask);
    return;
  }

  const action = inferActionFromObservation(backendObs);
  backendLastAction = action;

  let result;
  try {
    result = await apiJson("/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  } catch (err) {
    if (err?.status === 409) {
      // Episode is done or not initialized; reset and continue polling.
      await backendReset(backendTask);
      return;
    }
    throw err;
  }

  backendObs = result.observation || null;
  applyBackendObservation(backendObs);

  if (backendObs?.debate_challenge) {
    logTerm(`CHALLENGE: ${backendObs.debate_challenge}`, "t-warn");
  }

  if (result.done) {
    addIncident(incidentFromBackendResult(result, action));
    const nextTask = document.getElementById("trainTask")?.value || backendTask;
    await backendReset(nextTask === "all" ? "easy" : nextTask);
  }
}

async function initBackendIntegration() {
  try {
    await apiJson("/health");
    backendMode = true;
    logTerm("Backend connected on /api/backend -> FastAPI", "t-ok");

    const selectedTask = document.getElementById("trainTask")?.value || "easy";
    await backendReset(selectedTask === "all" ? "easy" : selectedTask);

    backendPollDelayMs = BACKEND_POLL_MIN_MS;
    startBackendPolling();
  } catch (_) {
    backendMode = false;
    logTerm("Backend unavailable - running local simulation fallback", "t-warn");
    startSimulation();
  }
}

function startBackendPolling() {
  if (backendPollTimer) {
    clearTimeout(backendPollTimer);
    backendPollTimer = null;
  }

  const run = async () => {
    try {
      await backendTick();
      backendPollDelayMs = BACKEND_POLL_MIN_MS;
    } catch (err) {
      logTerm(`Backend poll failed: ${err.message}`, "t-warn");
      backendPollDelayMs = Math.min(BACKEND_POLL_MAX_MS, Math.max(5000, backendPollDelayMs * 2));
    } finally {
      backendPollTimer = setTimeout(run, backendPollDelayMs);
    }
  };

  backendPollTimer = setTimeout(run, backendPollDelayMs);
}

function addIncident(inc) {
  incidents.unshift(inc);
  incBadgeN++;
  const kpiInc = document.getElementById("kpiInc");
  if (kpiInc) kpiInc.textContent = incidents.length;
  const b = document.getElementById("incBadge");
  if (b) {
    b.textContent = incBadgeN;
    b.style.display = "";
  }

  const sev = inc.analysis?.severity || "P2";
  if (sev in sevCounts) sevCounts[sev]++;
  if (sevC) {
    sevC.data.datasets[0].data = ["P0", "P1", "P2", "P3"].map((s) => sevCounts[s]);
    sevC.update("none");
  }

  const ft = inc.analysis?.root_cause_type || "unknown";
  ftCounts[ft] = (ftCounts[ft] || 0) + 1;
  if (ftC) {
    const e = Object.entries(ftCounts);
    ftC.data.labels = e.map((x) => x[0]);
    ftC.data.datasets[0].data = e.map((x) => x[1]);
    ftC.data.datasets[0].backgroundColor = e.map((_, i) => MULTI_COLORS[i % MULTI_COLORS.length] + "99");
    ftC.data.datasets[0].borderColor = e.map((_, i) => MULTI_COLORS[i % MULTI_COLORS.length]);
    ftC.update("none");
  }

  const conf = inc.analysis?.confidence || 0;
  totalConf += conf;
  confN++;
  const kpiConf = document.getElementById("kpiConf");
  if (kpiConf) kpiConf.textContent = ((totalConf / confN) * 100).toFixed(0) + "%";

  renderRecentInc();
  logTerm(`INC ${inc.id} → ${inc.analysis?.root_cause_service} [${sev}] ${inc.remediation?.action}`, "t-warn");
}

function incCard(inc) {
  const sev = inc.analysis?.severity || "P2";
  const rc = inc.analysis?.root_cause_service || "—";
  const ft = inc.analysis?.root_cause_type || "—";
  const act = inc.remediation?.action || "—";
  const ts = inc.timestamp ? new Date(inc.timestamp).toLocaleTimeString() : "—";
  return `<div class="incident-card inc-${sev}" onclick="openInc('${inc.id}')">
    <div class="inc-top">
      <span class="inc-rc">${rc}</span>
      <span class="sev sev-${sev}">${sev}</span>
    </div>
    <div class="inc-meta">${ft} · ${act.replace(/_/g, " ")} · ${ts}</div>
  </div>`;
}

function renderRecentInc() {
  const el = document.getElementById("recentInc");
  if (el) el.innerHTML = incidents.slice(0, 5).map(incCard).join("");
}
function renderIncidentList() {
  const el = document.getElementById("incidentList");
  if (el) {
    const incTotal = document.getElementById("incTotal");
    if (incTotal) incTotal.textContent = incidents.length + " total";
    el.innerHTML = incidents.map(incCard).join("") || '<div class="text-muted" style="padding:24px;text-align:center">No incidents yet</div>';
  }
}

function openInc(id) {
  const inc = incidents.find((i) => i.id === id);
  if (!inc) return;
  const a = inc.analysis || {};
  const r = inc.remediation || {};
  const runbook = (r.runbook || []).map((s) => `<div class="runbook-step">${s}</div>`).join("");
  const panel = document.getElementById("detailPanel");
  if (!panel) return;
  panel.innerHTML = `
    <div class="flex justify-between items-center">
      <div style="font-family:var(--head);font-size:22px;color:var(--electric);letter-spacing:1px">${id}</div>
      <button class="dp-close" onclick="closeDetail()">✕</button>
    </div>
    <div class="flex gap8">
      <span class="sev sev-${a.severity}">${a.severity}</span>
      <span class="mono text-muted" style="font-size:10px;align-self:center">${a.root_cause_type}</span>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Root Cause</div>
      <div class="text-cyan" style="font-family:var(--mono);font-size:16px;font-weight:600">${a.root_cause_service}</div>
      <div class="text-muted" style="font-size:11px;margin-top:6px;line-height:1.7">${a.reasoning || ""}</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Confidence</div>
      <div class="conf-row">
        <div class="conf-track"><div class="conf-fill" style="width:${(a.confidence || 0) * 100}%"></div></div>
        <span class="mono fw600" style="font-size:13px">${((a.confidence || 0) * 100).toFixed(0)}%</span>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Affected Services</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${(a.affected_services || [])
          .map(
            (s) =>
              `<span style="background:rgba(0,229,255,.08);color:var(--electric);border:1px solid rgba(0,229,255,.2);padding:3px 10px;border-radius:2px;font-family:var(--mono);font-size:10px">${s}</span>`
          )
          .join("")}
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Stakeholder Message</div>
      <div style="font-size:11px;line-height:1.8;border-left:2px solid var(--amber);padding-left:12px">${a.stakeholder_message || "—"}</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px">Remediation — ${(r.action || "").replace(/_/g, " ").toUpperCase()}</div>
      <div style="font-size:11px;margin-bottom:12px;color:${r.requires_approval ? "var(--amber)" : "var(--volt)"}">${r.message || ""}</div>
      ${runbook}
      ${
        r.requires_approval
          ? `
      <div class="flex gap8 mt12">
        <button class="btn btn-volt btn-sm" onclick="approveRem('${id}',true)">✓ APPROVE</button>
        <button class="btn btn-danger btn-sm" onclick="approveRem('${id}',false)">✕ REJECT</button>
      </div>`
          : ""
      }
    </div>
    ${inc.agents && inc.agents.length ? `
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">Multi-Agent Workflow</div>
      <div class="agent-timeline">
        ${inc.agents.map(ag => `
        <div class="agent-step" style="color: ${ag.color}">
          <div class="agent-dot"></div>
          <div class="agent-content">
            <div class="agent-tier" style="color: ${ag.color}">${ag.tier}</div>
            <div class="agent-task">${ag.task}</div>
            <div class="agent-output" style="border-color: ${ag.color}">${ag.output}</div>
          </div>
        </div>
        `).join("")}
      </div>
    </div>
    ` : ""}
    `;
  const overlay = document.getElementById("detailOverlay");
  if (overlay) overlay.classList.add("open");
}
function closeDetail() {
  const overlay = document.getElementById("detailOverlay");
  if (overlay) overlay.classList.remove("open");
}

async function approveRem(id, ok) {
  try {
    await fetch(`${API}/remediate/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incident_id: id, approved: ok }),
    });
  } catch (_) {}
  closeDetail();
  logTerm(`Remediation ${ok ? "APPROVED" : "REJECTED"}: ${id}`, ok ? "t-ok" : "t-warn");
}

let _trainSim = null;
let _simEp = 0;
let _totalEps = 100;

function startTraining() {
  launchTraining();
}

function launchTraining() {
  const task = document.getElementById("trainTask")?.value || "all";
  if (backendMode) {
    backendTask = task === "all" ? "easy" : task;
  }
  const eps = parseInt(document.getElementById("trainEps")?.value || "100", 10);
  const curr = !!document.getElementById("useCurriculum")?.checked;
  const chal = !!document.getElementById("useChallenger")?.checked;
  _totalEps = eps;
  _simEp = 0;
  document.getElementById("trainProg")?.classList.remove("hidden");
  const trainItem = document.getElementById("trainItem");
  if (trainItem) trainItem.style.display = "";
  const trainBadge = document.getElementById("trainBadge");
  if (trainBadge) trainBadge.style.display = "";
  trainRunning = true;

  logTerm(`TRAINING STARTED — task=${task} eps=${eps} curriculum=${curr} challenger=${chal}`, "t-info");

  fetch(`${API}/train/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, episodes: eps, curriculum: curr }),
  })
    .then(() => pollTrainStatus())
    .catch(() => simulateTrain(task, eps, curr, chal));
}

function simulateTrain(task, eps, curr, chal) {
  const tasks = task === "all" ? ["easy", "medium", "hard"] : [task];
  const CEILINGS = { easy: 0.88, medium: 0.76, hard: 0.6 };

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  _trainSim = setInterval(() => {
    if (_simEp >= eps) {
      clearInterval(_trainSim);
      trainRunning = false;
      const trainItem = document.getElementById("trainItem");
      if (trainItem) trainItem.style.display = "none";
      logTerm("TRAINING COMPLETE ✓", "t-ok");
      const kpiEps = document.getElementById("kpiEps");
      if (kpiEps) kpiEps.textContent = String(_simEp);
      return;
    }

    const t = curr ? tasks[Math.min(tasks.length - 1, Math.floor((_simEp / eps) * tasks.length))] : tasks[_simEp % tasks.length];

    const prog = _simEp / eps;
    const skill = sigmoid(10 * (prog - 0.4)) * CEILINGS[t];
    const noise = (Math.random() - 0.5) * 0.12;
    const rwd = Math.max(0, Math.min(1, skill + noise));
    const smooth = rollingAvg(rewardSeries[t].concat(rwd), 10).slice(-1)[0];

    const rc = Math.max(0, Math.min(1, skill * 1.05 + (Math.random() - 0.5) * 0.1));
    const act = Math.max(0, Math.min(1, skill * 0.95 + (Math.random() - 0.5) * 0.12));
    const sv = Math.max(0, Math.min(1, skill * 0.9 + (Math.random() - 0.5) * 0.1));
    const cm = Math.max(0, Math.min(1, skill * 0.8 + (Math.random() - 0.5) * 0.15));
    const spd = Math.max(0, Math.min(1, skill * 0.85 + (Math.random() - 0.5) * 0.18));
    const chalWin = chal && Math.random() < skill;

    rewardSeries[t].push(rwd);
    compSeries.rc.push(rc);
    compSeries.action.push(act);
    compSeries.severity.push(sv);
    compSeries.comm.push(cm);
    compSeries.speed.push(spd);
    chalSeries.push(chalWin ? 1 : 0);
    speedSeries.push(spd);

    if (rewC) {
      const tIdx = { easy: 0, medium: 1, hard: 2 }[t] ?? 0;
      if (rewC.data.labels.length > MAX_PTS) {
        rewC.data.labels.shift();
        rewC.data.datasets.forEach((d) => d.data.shift());
      }
      rewC.data.labels.push(String(_simEp));
      rewC.data.datasets[tIdx].data.push(smooth);
      rewC.update("none");
    }

    if (comC) {
      if (comC.data.labels.length > MAX_PTS) {
        comC.data.labels.shift();
        comC.data.datasets.forEach((d) => d.data.shift());
      }
      comC.data.labels.push(String(_simEp));
      comC.data.datasets[0].data.push(rc);
      comC.data.datasets[1].data.push(act);
      comC.data.datasets[2].data.push(sv);
      comC.data.datasets[3].data.push(cm);
      comC.data.datasets[4].data.push(spd);
      comC.update("none");
    }

    if (rcC) {
      if (rcC.data.labels.length > MAX_PTS) {
        rcC.data.labels.shift();
        rcC.data.datasets[0].data.shift();
      }
      rcC.data.labels.push(String(_simEp));
      rcC.data.datasets[0].data.push(rc);
      rcC.update("none");
    }

    if (_simEp % 5 === 0 && chalC) {
      const rate = rollingAvg(chalSeries, 10).slice(-1)[0];
      if (chalC.data.labels.length > MAX_PTS) {
        chalC.data.labels.shift();
        chalC.data.datasets[0].data.shift();
      }
      chalC.data.labels.push(String(_simEp));
      chalC.data.datasets[0].data.push(rate);
      chalC.update("none");
    }

    if (spdC) {
      if (spdC.data.labels.length > MAX_PTS) {
        spdC.data.labels.shift();
        spdC.data.datasets[0].data.shift();
      }
      spdC.data.labels.push(String(_simEp));
      spdC.data.datasets[0].data.push(spd);
      spdC.update("none");
    }

    const scEasy = document.getElementById("scEasy");
    if (scEasy) scEasy.textContent = avgLast10(rewardSeries.easy).toFixed(2);
    const scMed = document.getElementById("scMed");
    if (scMed) scMed.textContent = avgLast10(rewardSeries.medium).toFixed(2);
    const scHard = document.getElementById("scHard");
    if (scHard) scHard.textContent = avgLast10(rewardSeries.hard).toFixed(2);
    const bestEasy = document.getElementById("bestEasy");
    if (bestEasy) bestEasy.textContent = (Math.max(0, ...rewardSeries.easy) || 0).toFixed(2);
    const bestMed = document.getElementById("bestMed");
    if (bestMed) bestMed.textContent = (Math.max(0, ...rewardSeries.medium) || 0).toFixed(2);
    const bestHard = document.getElementById("bestHard");
    if (bestHard) bestHard.textContent = (Math.max(0, ...rewardSeries.hard) || 0).toFixed(2);

    const allR = [...rewardSeries.easy, ...rewardSeries.medium, ...rewardSeries.hard];
    const statEps = document.getElementById("statEps");
    if (statEps) statEps.textContent = String(_simEp);
    const statChal = document.getElementById("statChal");
    if (statChal) statChal.textContent = String(chalSeries.filter(Boolean).length);
    const statAvg = document.getElementById("statAvg");
    if (statAvg) statAvg.textContent = avgLast10(allR).toFixed(2);
    const kpiEps = document.getElementById("kpiEps");
    if (kpiEps) kpiEps.textContent = String(_simEp);

    const pct = Math.round((_simEp / eps) * 100);
    const trainPct = document.getElementById("trainPct");
    if (trainPct) trainPct.textContent = pct + "%";
    const trainBar = document.getElementById("trainBar");
    if (trainBar) trainBar.style.width = pct + "%";
    const trainEpNum = document.getElementById("trainEpNum");
    if (trainEpNum) trainEpNum.textContent = String(_simEp);

    if (_simEp % 10 === 0 || _simEp < 5) {
      logTerm(
        `ep=${String(_simEp).padStart(4, "0")} task=${t} reward=${rwd.toFixed(3)} rc=${(rc * 100).toFixed(0)}% chal=${chalWin ? "✓" : "✗"}`,
        "t-ok"
      );
    }

    _simEp++;
  }, 80);
}

async function pollTrainStatus() {
  try {
    const r = await fetch(`${API}/train/status`);
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} for /train/status`);
    }
    const d = await r.json();
    trainStatusPollDelayMs = TRAIN_STATUS_POLL_MIN_MS;
    if (d.per_task) updateFromSummary(d);

    if (d.running) {
      if (trainStatusPollTimer) clearTimeout(trainStatusPollTimer);
      trainStatusPollTimer = setTimeout(pollTrainStatus, trainStatusPollDelayMs);
    }
  } catch (err) {
    trainStatusPollDelayMs = Math.min(TRAIN_STATUS_POLL_MAX_MS, Math.max(5000, trainStatusPollDelayMs * 2));
    logTerm(`Train status poll failed: ${err.message}`, "t-warn");
    if (trainStatusPollTimer) clearTimeout(trainStatusPollTimer);
    trainStatusPollTimer = setTimeout(pollTrainStatus, trainStatusPollDelayMs);
  }
}

function updateFromSummary(d) {
  if (!d.per_task) return;
  for (const [t, info] of Object.entries(d.per_task)) {
    if (!info.rewards) continue;
    rewardSeries[t] = info.rewards;
    const ti = { easy: 0, medium: 1, hard: 2 }[t] ?? 0;
    if (rewC && rewC.data.datasets[ti]) {
      rewC.data.datasets[ti].data = rollingAvg(info.rewards, 10);
      if (rewC.data.labels.length < info.rewards.length) {
        rewC.data.labels = info.rewards.map((_, i) => String(i));
      }
      rewC.update("none");
    }
  }
}

function loadTrainingCurves() {
  logTerm("Loading reward_curves.json…", "t-info");
  fetch(`${API}/train/logs?n=500`)
    .then((r) => r.json())
    .then((d) => {
      const logs = d.logs || [];
      logs.forEach((l) => {
        const t = l.task_id;
        if (!(t in rewardSeries)) return;
        rewardSeries[t].push(l.reward);
        if (l.breakdown) {
          compSeries.rc.push(l.breakdown.root_cause || 0);
          compSeries.action.push(l.breakdown.action || 0);
          compSeries.severity.push(l.breakdown.severity || 0);
          compSeries.comm.push(l.breakdown.communication || 0);
          compSeries.speed.push(l.breakdown.speed || 0);
        }
        chalSeries.push(l.challenger_improved ? 1 : 0);
      });
      rebuildAllCharts();
      logTerm(`Loaded ${logs.length} training steps from log`, "t-ok");
    })
    .catch(() => {
      logTerm("No backend found — demo data loaded", "t-warn");
      preloadDemoData();
    });
}

function preloadDemoData() {
  for (let i = 0; i < 120; i++) {
    const t = i < 40 ? "easy" : i < 80 ? "medium" : "hard";
    const prog = (i % 40) / 40;
    const skill = (1 / (1 + Math.exp(-10 * (prog - 0.4)))) * (t === "easy" ? 0.88 : t === "medium" ? 0.76 : 0.6);
    const rwd = Math.max(0, Math.min(1, skill + (Math.random() - 0.5) * 0.12));
    rewardSeries[t].push(rwd);
    compSeries.rc.push(Math.max(0, Math.min(1, skill * 1.05 + (Math.random() - 0.5) * 0.1)));
    compSeries.action.push(Math.max(0, Math.min(1, skill * 0.92 + (Math.random() - 0.5) * 0.12)));
    compSeries.severity.push(Math.max(0, Math.min(1, skill * 0.88 + (Math.random() - 0.5) * 0.1)));
    compSeries.comm.push(Math.max(0, Math.min(1, skill * 0.82 + (Math.random() - 0.5) * 0.14)));
    compSeries.speed.push(Math.max(0, Math.min(1, skill * 0.85 + (Math.random() - 0.5) * 0.18)));
    chalSeries.push(Math.random() < skill ? 1 : 0);
  }
  rebuildAllCharts();
}

function rebuildAllCharts() {
  if (rewC) {
    ["easy", "medium", "hard"].forEach((t, ti) => {
      const sm = rollingAvg(rewardSeries[t], 10);
      rewC.data.datasets[ti].data = sm;
    });
    rewC.data.labels = rewardSeries.easy.map((_, i) => String(i));
    rewC.update();
  }

  if (comC) {
    const keys = ["rc", "action", "severity", "comm", "speed"];
    keys.forEach((k, ki) => {
      comC.data.datasets[ki].data = rollingAvg(compSeries[k], 8);
    });
    comC.data.labels = compSeries.rc.map((_, i) => String(i));
    comC.update();
  }

  if (rcC) {
    rcC.data.datasets[0].data = rollingAvg(compSeries.rc, 8);
    rcC.data.labels = compSeries.rc.map((_, i) => String(i));
    rcC.update();
  }

  if (chalC) {
    const rate = rollingAvg(chalSeries, 10);
    chalC.data.datasets[0].data = rate.filter((_, i) => i % 5 === 0);
    chalC.data.labels = rate.filter((_, i) => i % 5 === 0).map((_, i) => String(i * 5));
    chalC.update();
  }

  if (spdC) {
    spdC.data.datasets[0].data = rollingAvg(compSeries.speed, 8);
    spdC.data.labels = compSeries.speed.map((_, i) => String(i));
    spdC.update();
  }

  const scEasy = document.getElementById("scEasy");
  if (scEasy) scEasy.textContent = avgLast10(rewardSeries.easy).toFixed(2);
  const scMed = document.getElementById("scMed");
  if (scMed) scMed.textContent = avgLast10(rewardSeries.medium).toFixed(2);
  const scHard = document.getElementById("scHard");
  if (scHard) scHard.textContent = avgLast10(rewardSeries.hard).toFixed(2);
  const bestEasy = document.getElementById("bestEasy");
  if (bestEasy) bestEasy.textContent = Math.max(0, ...rewardSeries.easy).toFixed(2);
  const bestMed = document.getElementById("bestMed");
  if (bestMed) bestMed.textContent = Math.max(0, ...rewardSeries.medium).toFixed(2);
  const bestHard = document.getElementById("bestHard");
  if (bestHard) bestHard.textContent = Math.max(0, ...rewardSeries.hard).toFixed(2);
  const all = [...rewardSeries.easy, ...rewardSeries.medium, ...rewardSeries.hard];
  const statEps = document.getElementById("statEps");
  if (statEps) statEps.textContent = String(all.length);
  const statChal = document.getElementById("statChal");
  if (statChal) statChal.textContent = String(chalSeries.filter(Boolean).length);
  const statAvg = document.getElementById("statAvg");
  if (statAvg) statAvg.textContent = avgLast10(all).toFixed(2);
  const kpiEps = document.getElementById("kpiEps");
  if (kpiEps) kpiEps.textContent = String(all.length);
}

const FAULT_TYPES = ["misconfiguration", "memory_leak", "network_partition", "crash_loop", "resource_exhaustion"];
const FAULT_SVCS = ["payments-db", "auth-service", "order-service", "user-service"];

function injectFault() {
  faultType = FAULT_TYPES[Math.floor(Math.random() * FAULT_TYPES.length)];
  faultSvc = FAULT_SVCS[Math.floor(Math.random() * FAULT_SVCS.length)];
  faultActive = true;
  simTick = 0;
  const faultItem = document.getElementById("faultItem");
  if (faultItem) faultItem.style.display = "";
  logTerm(`FAULT INJECTED: ${faultType} → ${faultSvc}`, "t-err");

  fetch(`${API}/fault/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fault_type: faultType, target: faultSvc }),
  }).catch(() => {});

  setTimeout(() => {
    if (faultActive) generateIncident(faultType, faultSvc);
  }, 6000);
}

function clearFault() {
  faultActive = false;
  simTick = 0;
  const faultItem = document.getElementById("faultItem");
  if (faultItem) faultItem.style.display = "none";
  logTerm("FAULT CLEARED — system recovering", "t-ok");
  fetch(`${API}/fault/clear`, { method: "POST" }).catch(() => {});
}

function generateIncident(ft, svc) {
  const sevMap = {
    memory_leak: "P0",
    crash_loop: "P0",
    misconfiguration: "P0",
    network_partition: "P1",
    resource_exhaustion: "P1",
  };
  const actMap = {
    memory_leak: "restart_service",
    crash_loop: "restart_service",
    misconfiguration: "fix_config",
    network_partition: "fix_config",
    resource_exhaustion: "scale_up",
  };
  const sev = sevMap[ft] || "P1";
  const act = actMap[ft] || "investigate_further";
  const cascades = {
    "payments-db": ["payments-db", "cache-service", "order-service", "api-gateway", "storefront-ui"],
    "auth-service": ["auth-service", "api-gateway", "storefront-ui"],
    "order-service": ["order-service", "api-gateway", "storefront-ui"],
    "user-service": ["user-service", "auth-service", "api-gateway", "storefront-ui"],
  };
  const affected = cascades[svc] || [svc, "api-gateway"];
  const conf = 0.7 + Math.random() * 0.28;
  const inc = {
    id: `INC-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    analysis: {
      root_cause_service: svc,
      root_cause_type: ft,
      severity: sev,
      affected_services: affected,
      confidence: parseFloat(conf.toFixed(2)),
      reasoning: `Topology traversal from edge services inward. ${svc} shows highest degradation score (${ft} pattern). Cascade chain: ${affected.join(" → ")}.`,
      stakeholder_message:
        sev === "P0" || sev === "P1"
          ? `[${sev}] ${svc} ${ft.replace(/_/g, " ")} detected. ${affected.length} services in cascade. Action: ${act.replace(/_/g, " ")}. ETA ~10 min.`
          : null,
    },
    remediation: {
      action: act,
      status: "pending_approval",
      requires_approval: true,
      message: `⚠️ Approval required: ${act.replace(/_/g, " ")} on ${svc}`,
      runbook: [
        `1. kubectl rollout restart deployment/${svc} -n production`,
        `2. Watch pods: kubectl get pods -l app=${svc} -w`,
        `3. Verify metrics recovery within 2 minutes`,
        `4. If not recovered: escalate to on-call lead`,
      ],
    },
    agents: [
      { tier: "L1 Triage Agent", task: "Initial Triage & Topology Mapping", output: `Detected cascade across ${affected.length} services. Severity: ${sev}`, color: "var(--electric)" },
      { tier: "L2 Diagnostic Agent", task: "Root Cause Analysis", output: `Diagnosed root cause as ${svc} (${ft}). Confidence: ${(conf*100).toFixed(0)}%.`, color: "var(--purple)" },
      { tier: "L3 Remediation Agent", task: "Runbook Generation", output: `Proposed remediation: ${act.replace(/_/g, " ")}.`, color: "var(--volt)" }
    ],
  };
  addIncident(inc);
}

function startSimulation() {
  const baseMetrics = {};
  SVCS.forEach((s) => {
    baseMetrics[s] = {
      cpu: 0.15 + Math.random() * 0.3,
      mem: 0.2 + Math.random() * 0.3,
      rt: 40 + Math.random() * 80,
    };
  });

  setInterval(() => {
    simTick++;
    const metrics = {};
    const alerts = [];
    const faultProg = faultActive ? Math.min(1, simTick / 8) : 0;

    SVCS.forEach((s) => {
      const b = baseMetrics[s];
      const irc = faultActive && s === faultSvc;
      const cascade = faultActive && ["api-gateway", "storefront-ui", "order-service"].includes(s) && simTick > 3;
      const cprog = cascade ? faultProg * 0.5 : irc ? faultProg : 0;

      const cpu = Math.max(0, Math.min(0.99, b.cpu + cprog * 0.6 + (Math.random() - 0.5) * 0.03));
      const mem = Math.max(0, Math.min(0.99, b.mem + (irc ? faultProg * 0.42 : 0) + (Math.random() - 0.5) * 0.02));
      const rt = Math.max(1, b.rt * (1 + cprog * 25));

      const st = cpu > 0.9 || mem > 0.9 ? "failing" : cpu > 0.7 || mem > 0.7 ? "critical" : cpu > 0.5 || mem > 0.5 ? "degraded" : "healthy";
      metrics[s] = {
        cpu_utilization: parseFloat(cpu.toFixed(3)),
        memory_utilization: parseFloat(mem.toFixed(3)),
        http_rt: parseFloat(rt.toFixed(1)),
        is_healthy: st === "healthy",
        status: st,
      };

      if (st !== "healthy") {
        alerts.push({
          service: s,
          metric: mem > 0.85 ? "memory_utilization" : "cpu_utilization",
          current_value: parseFloat((mem > 0.85 ? mem : cpu).toFixed(3)),
          threshold: 0.85,
          severity: st === "failing" ? "critical" : "warning",
          fired_at_step: simTick,
        });
      }
    });

    renderSvcGrid(metrics);
    const healthy = Object.values(metrics).filter((m) => m.is_healthy).length;
    const kpiHealthy = document.getElementById("kpiHealthy");
    if (kpiHealthy) kpiHealthy.textContent = String(healthy);
    const kpiTotal = document.getElementById("kpiTotal");
    if (kpiTotal) kpiTotal.textContent = String(SVCS.length);
    const svcTime = document.getElementById("svcTime");
    if (svcTime) svcTime.textContent = new Date().toLocaleTimeString();

    const ts = new Date().toLocaleTimeString();
    pushMonitorMetric(cpuC, ts, metrics, "cpu_utilization");
    pushMonitorMetric(memC, ts, metrics, "memory_utilization");
    pushMonitorMetric(rtC, ts, metrics, "http_rt");

    if (alerts.length) renderAlerts(alerts);
  }, 2500);
}

async function runAnalysis() {
  const body = document.getElementById("logBody")?.value || "";
  const out = document.getElementById("analysisOut");
  if (!out) return;

  if (!body.trim()) {
    out.innerHTML =
      '<div class="card-head"><span class="card-title">Analysis Result</span></div><div class="text-muted" style="padding:24px;text-align:center">Please enter log content first.</div>';
    return;
  }
  out.innerHTML =
    '<div class="card-head"><span class="card-title">Analysis Result</span></div><div class="text-cyan" style="padding:24px;text-align:center;font-family:var(--mono)">⟳ Running RCA…</div>';
  await new Promise((r) => setTimeout(r, 700));

  const KNOWN = [
    "payments-db",
    "payments-api",
    "auth-service",
    "api-gateway",
    "storefront-ui",
    "order-service",
    "cache-service",
    "user-service",
    "checkout-ui",
    "notification-svc",
  ];
  const ERR_KWS = ["oom", "crash", "timeout", "failed", "nxdomain", "503", "502", "504", "refused", "exception", "error", "heap", "exhausted", "leak"];
  const bodyL = body.toLowerCase();
  const signals = {};
  KNOWN.forEach((s) => {
    if (bodyL.includes(s)) {
      let score = 0.25;
      const idx = bodyL.indexOf(s);
      const ctx = bodyL.slice(Math.max(0, idx - 150), idx + 150);
      ERR_KWS.forEach((kw) => {
        if (ctx.includes(kw)) score += 0.12;
      });
      signals[s] = Math.min(0.99, parseFloat(score.toFixed(2)));
    }
  });

  const rc = Object.keys(signals).length ? Object.entries(signals).sort((a, b) => b[1] - a[1])[0][0] : "unknown";
  const conf = signals[rc] || 0.1;

  let ft = "misconfiguration";
  if (bodyL.includes("oom") || bodyL.includes("heap") || bodyL.includes("memory")) ft = "memory_leak";
  else if (bodyL.includes("nxdomain") || bodyL.includes("dns")) ft = "network_partition";
  else if (bodyL.includes("crash") || bodyL.includes("restart")) ft = "crash_loop";
  else if (bodyL.includes("cpu") || bodyL.includes("exhausted")) ft = "resource_exhaustion";

  const sev = conf > 0.55 && (ft === "memory_leak" || ft === "crash_loop") ? "P0" : conf > 0.35 ? "P1" : "P2";
  const acts = {
    memory_leak: "restart_service",
    crash_loop: "restart_service",
    network_partition: "fix_config",
    misconfiguration: "fix_config",
    resource_exhaustion: "scale_up",
  };
  const act = acts[ft];

  const sigHtml =
    Object.entries(signals)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([s, v]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
      <span class="mono" style="font-size:11px">${s}</span>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:90px;height:3px;background:var(--border);border-radius:2px">
          <div style="width:${Math.min(100, v * 100)}%;height:100%;background:var(--electric);border-radius:2px"></div>
        </div>
        <span class="mono text-muted" style="font-size:10px">${(v * 100).toFixed(0)}%</span>
      </div>
    </div>`
      )
      .join("") || '<div class="text-muted" style="font-size:11px">No known services detected</div>';

  const incToAdd = {
    id: `ANA-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    analysis: {
      root_cause_service: rc,
      root_cause_type: ft,
      severity: sev,
      affected_services: Object.keys(signals).slice(0, 5),
      confidence: parseFloat(conf.toFixed(2)),
      reasoning: `Log analysis: ${rc} cited with error keywords in context. Pattern matches ${ft}.`,
      stakeholder_message: `[${sev}] ${rc} (${ft}) detected via log analysis. Cascade risk. Action: ${act?.replace(/_/g, " ")}. ETA ~10 min.`,
    },
    remediation: {
      action: act,
      status: "pending_approval",
      requires_approval: true,
      message: `⚠️ Approval: ${act?.replace(/_/g, " ")} on ${rc}`,
      runbook: [`kubectl rollout restart deployment/${rc} -n production`],
    },
    agents: [
      { tier: "L1 Triage Agent", task: "Log Analysis & Triage", output: `Detected cascade to ${Object.keys(signals).length} services. Severity: ${sev}`, color: "var(--electric)" },
      { tier: "L2 Diagnostic Agent", task: "Root Cause Analysis", output: `Diagnosed root cause as ${rc} (${ft}) via log keywords. Confidence: ${(conf*100).toFixed(0)}%.`, color: "var(--purple)" },
      { tier: "L3 Remediation Agent", task: "Runbook Generation", output: `Proposed remediation: ${act?.replace(/_/g, " ")}.`, color: "var(--volt)" }
    ],
  };
  addIncident(incToAdd);

  out.innerHTML = `
    <div class="card-head">
      <span class="card-title">Analysis Result</span>
      <span class="sev sev-${sev}">${sev}</span>
    </div>
    <div class="card mb12">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span class="mono text-muted" style="font-size:9px;letter-spacing:2px">ROOT CAUSE</span>
        <span class="mono text-cyan fw600" style="font-size:14px">${rc}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span class="mono text-muted" style="font-size:9px;letter-spacing:2px">FAULT TYPE</span>
        <span class="mono">${ft}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px">
        <span class="mono text-muted" style="font-size:9px;letter-spacing:2px">RECOMMENDED ACTION</span>
        <span class="mono text-volt fw600">${act?.replace(/_/g, " ")}</span>
      </div>
      <div class="conf-row">
        <span class="mono text-muted" style="font-size:9px;width:70px">CONFIDENCE</span>
        <div class="conf-track"><div class="conf-fill" style="width:${conf * 100}%"></div></div>
        <span class="mono fw600" style="font-size:13px">${(conf * 100).toFixed(0)}%</span>
      </div>
    </div>
    <div class="card mb12">
      <div class="card-title" style="margin-bottom:10px">SERVICE SIGNALS</div>
      ${sigHtml}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:8px">STAKEHOLDER MESSAGE</div>
      <div style="font-size:11px;line-height:1.8;border-left:2px solid var(--amber);padding-left:12px;color:var(--text)">
        [${sev}] ${rc} (${ft}) detected. Cascade to ${Object.keys(signals).length} services.
        Immediate: ${act?.replace(/_/g, " ")} on ${rc}. ETA ~10 min.
      </div>
    </div>`;
}

function renderReports() {
  const tbody = document.getElementById("reportsTbody");
  if (!tbody) return;
  if (!incidents.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px">No reports yet — inject a fault or run analysis</td></tr>';
    return;
  }
  tbody.innerHTML = incidents
    .map((inc) => {
      const a = inc.analysis || {};
      const r = inc.remediation || {};
      const ts = inc.timestamp ? new Date(inc.timestamp).toLocaleString() : "—";
      return `<tr>
      <td class="mono text-cyan" style="font-size:10px">${inc.id}</td>
      <td><span class="sev sev-${a.severity}">${a.severity}</span></td>
      <td class="mono fw600">${a.root_cause_service || "—"}</td>
      <td class="text-muted">${a.root_cause_type || "—"}</td>
      <td>${(r.action || "—").replace(/_/g, " ")}</td>
      <td><div class="conf-row" style="gap:8px">
        <div class="conf-track" style="width:60px"><div class="conf-fill" style="width:${(a.confidence || 0) * 100}%"></div></div>
        <span class="mono" style="font-size:10px">${((a.confidence || 0) * 100).toFixed(0)}%</span>
      </div></td>
      <td class="text-muted" style="font-size:10px">${ts}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openInc('${inc.id}')">VIEW</button></td>
    </tr>`;
    })
    .join("");
}

function exportReports() {
  // 1. Download JSON
  const blob = new Blob([JSON.stringify(incidents, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sentinel_reports_${Date.now()}.json`;
  a.click();

  // 2. Download PDF
  if (window.jspdf && window.jspdf.jsPDF) {
    const doc = new window.jspdf.jsPDF();
    doc.text("Sentinel Incident Reports Detailed View", 14, 15);
    
    let currentY = 25;

    incidents.forEach((inc, index) => {
      const an = inc.analysis || {};
      const r = inc.remediation || {};
      const ts = inc.timestamp ? new Date(inc.timestamp).toLocaleString() : "—";
      
      // Add a page if we're near the bottom
      if (currentY > 240 && index > 0) {
        doc.addPage();
        currentY = 20;
      }

      // Title for the Incident
      doc.setFontSize(11);
      doc.setTextColor(0, 150, 200);
      doc.text(`Incident: ${inc.id} | Severity: ${an.severity || "-"} | Time: ${ts}`, 14, currentY);
      currentY += 4;

      // 1. Analysis Data
      doc.autoTable({
        startY: currentY,
        head: [["Analysis Property", "Details"]],
        body: [
          ["Root Cause Service", an.root_cause_service || "-"],
          ["Fault Type", an.root_cause_type || "-"],
          ["Confidence", ((an.confidence || 0) * 100).toFixed(0) + "%"],
          ["Affected Services", (an.affected_services || []).join(", ")],
          ["Reasoning", an.reasoning || "-"],
          ["Stakeholder Message", an.stakeholder_message || "-"]
        ],
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } }
      });
      currentY = doc.lastAutoTable.finalY + 5;

      // Add a page if near bottom before next table
      if (currentY > 260) { doc.addPage(); currentY = 20; }

      // 2. Remediation Data
      const runbookStr = (r.runbook || []).join("\\n");
      doc.autoTable({
        startY: currentY,
        head: [["Remediation Property", "Details"]],
        body: [
          ["Action", (r.action || "-").replace(/_/g, " ")],
          ["Status", r.status || "-"],
          ["Requires Approval", r.requires_approval ? "Yes" : "No"],
          ["Message", r.message || "-"],
          ["Runbook", runbookStr || "-"]
        ],
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } }
      });
      currentY = doc.lastAutoTable.finalY + 5;

      // Add a page if near bottom before next table
      if (currentY > 260) { doc.addPage(); currentY = 20; }

      // 3. Multi-Agent Workflow Data
      if (inc.agents && inc.agents.length > 0) {
        const agentsBody = inc.agents.map(ag => [ag.tier, ag.task, ag.output]);
        doc.autoTable({
          startY: currentY,
          head: [["Agent Tier", "Task", "Output"]],
          body: agentsBody,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
          columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold' }, 1: { cellWidth: 40 } }
        });
        currentY = doc.lastAutoTable.finalY + 12;
      } else {
        currentY += 12;
      }
    });

    doc.save(`sentinel_reports_${Date.now()}.pdf`);
  } else {
    logTerm("PDF library not loaded yet.", "t-warn");
  }
}

function logTerm(msg, cls = "t-info") {
  const term = document.getElementById("trainTerm");
  if (!term) return;
  const ts = new Date().toLocaleTimeString();
  const div = document.createElement("div");
  div.className = "tl";
  div.innerHTML = `<span class="ts">${ts}</span><span class="${cls}">${msg}</span>`;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
  while (term.children.length > 200) term.removeChild(term.firstChild);
}
function clearTerm() {
  const trainTerm = document.getElementById("trainTerm");
  if (trainTerm) trainTerm.innerHTML = "";
}

function rollingAvg(arr, w) {
  return arr.map((_, i) => {
    const chunk = arr.slice(Math.max(0, i - w + 1), i + 1);
    return parseFloat((chunk.reduce((a, b) => a + b, 0) / chunk.length).toFixed(4));
  });
}
function avgLast10(arr) {
  if (!arr.length) return 0;
  const chunk = arr.slice(-10);
  return chunk.reduce((a, b) => a + b, 0) / chunk.length;
}

loadTrainingCurves();
initBackendIntegration();

function connectSSE() {
  if (backendMode) return;
  const src = new EventSource(`${API}/metrics/stream`);
  src.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      if (ev.type === "metrics_update" && ev.data?.metrics) {
        renderSvcGrid(ev.data.metrics);
        const h = Object.values(ev.data.metrics).filter((m) => m.is_healthy).length;
        const kpiHealthy = document.getElementById("kpiHealthy");
        if (kpiHealthy) kpiHealthy.textContent = String(h);
      }
      if (ev.type === "alerts_fired") renderAlerts(ev.data.alerts || []);
      if (ev.type === "incident_detected") addIncident(ev.data);
      if (ev.type === "fault_injected") {
        const faultItem = document.getElementById("faultItem");
        if (faultItem) faultItem.style.display = "";
        logTerm(`FAULT: ${ev.data.type} → ${ev.data.target}`, "t-err");
      }
    } catch (_) {}
  };
  src.onerror = () => setTimeout(connectSSE, 5000);
}

window.showTab = showTab;
window.injectFault = injectFault;
window.clearFault = clearFault;
window.startTraining = startTraining;
window.launchTraining = launchTraining;
window.loadTrainingCurves = loadTrainingCurves;
window.openInc = openInc;
window.closeDetail = closeDetail;
window.approveRem = approveRem;
window.runAnalysis = runAnalysis;
window.renderReports = renderReports;
window.exportReports = exportReports;
window.clearTerm = clearTerm;
