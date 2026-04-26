const API = "/api/backend";
let rewardChart = null;
let currentObservation = null;
let refreshPollTimer = null;
let refreshPollDelayMs = 5000;
const REFRESH_POLL_MIN_MS = 5000;
const REFRESH_POLL_MAX_MS = 10000;

function initChart() {
  const canvas = document.getElementById("rewardChart");
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  rewardChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Easy (smoothed)", data: [], borderColor: "#06d6a0", backgroundColor: "rgba(6,214,160,.08)", borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true },
        { label: "Medium (smoothed)", data: [], borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.08)", borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true },
        { label: "Hard (smoothed)", data: [], borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.08)", borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: true, grid: { color: "rgba(99,102,241,.08)" }, ticks: { color: "#64748b", font: { size: 9 } } },
        y: { min: 0, max: 1, grid: { color: "rgba(99,102,241,.08)" }, ticks: { color: "#64748b", font: { size: 9 } } },
      },
      plugins: { legend: { labels: { color: "#94a3b8", font: { size: 10 } } } },
      animation: { duration: 300 },
    },
  });
}

async function fetchJSON(url, options = undefined) {
  try {
    const response = await fetch(API + url, options);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function defaultActionFromObservation(obs) {
  const metrics = obs?.metrics || {};
  const sorted = Object.entries(metrics)
    .map(([name, m]) => {
      const cpu = Number(m.cpu_utilization || 0);
      const mem = Number(m.memory_utilization || 0);
      const rt = Number(m.http_rt || m.consumer_rpc_rt || 0);
      const healthPenalty = m.is_healthy ? 0 : 0.5;
      return { name, score: cpu * 0.35 + mem * 0.45 + Math.min(rt / 3000, 1) * 0.2 + healthPenalty, cpu, mem };
    })
    .sort((a, b) => b.score - a.score);

  const root = sorted[0] || { name: "api-gateway", score: 0.2, cpu: 0, mem: 0 };
  const affected = sorted.filter((s) => s.score > 0.5).map((s) => s.name);

  let rootType = "misconfiguration";
  let remediation = "fix_config";
  if (root.mem > 0.88) {
    rootType = "memory_leak";
    remediation = "restart_service";
  } else if (root.cpu > 0.9) {
    rootType = "resource_exhaustion";
    remediation = "scale_up";
  }

  const severity = root.score > 1.0 ? "P0" : root.score > 0.7 ? "P1" : "P2";
  return {
    root_cause_service: root.name,
    root_cause_type: rootType,
    severity,
    affected_services: affected.length ? affected : [root.name],
    remediation_action: remediation,
    stakeholder_message: `[${severity}] Investigating ${root.name}. Applying ${remediation}.`,
    confidence: Math.max(0.35, Math.min(0.95, Number((root.score / 1.4).toFixed(2)))),
    reasoning: `Highest degradation score detected at ${root.name}.`,
  };
}

async function ensureObservation() {
  if (currentObservation) return currentObservation;
  const reset = await fetchJSON("/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: "easy", dynamic: true }),
  });
  currentObservation = reset?.observation || null;
  return currentObservation;
}

async function fetchObservationStep() {
  const obs = await ensureObservation();
  if (!obs) return null;

  const action = defaultActionFromObservation(obs);
  const stepResponse = await fetch(API + "/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).catch(() => null);

  if (!stepResponse) return obs;

  if (stepResponse.status === 409) {
    // Episode ended or not initialized in this stateless session; reset and continue.
    const reset = await fetchJSON("/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: "easy", dynamic: true }),
    });
    currentObservation = reset?.observation || null;
    return currentObservation;
  }

  if (!stepResponse.ok) return obs;

  const stepResult = await stepResponse.json();

  currentObservation = stepResult.observation || null;

  if (stepResult.done) {
    addTimelineEvent("responder", `Episode finished with reward ${Number(stepResult.reward || 0).toFixed(3)}`);
    const reset = await fetchJSON("/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: "easy", dynamic: true }),
    });
    currentObservation = reset?.observation || null;
  }

  if (currentObservation?.debate_challenge) {
    addTimelineEvent("adversary", currentObservation.debate_challenge);
  }
  return currentObservation;
}

async function refreshData() {
  const [summary, curves, evaluation, curriculum, health] = await Promise.all([
    fetchJSON("/train/status"),
    fetchJSON("/train/reward-curves"),
    fetchJSON("/evaluation/latest"),
    fetchJSON("/curriculum/state"),
    fetchJSON("/health"),
  ]);

  if (summary) updateSummary(summary);
  else if (health) updateBackendSummaryFallback(health);

  if (curves) updateChart(curves);
  if (evaluation) updateEvaluation(evaluation);
  if (curriculum) updateCurriculum(curriculum);

  const obs = await fetchObservationStep();
  if (obs) {
    updateTopologyFromObservation(obs);
    updateObservationSummary(obs);
  }

  const hasLiveData = Boolean(summary || curves || evaluation || curriculum || health || obs);
  if (!hasLiveData) {
    throw new Error("All polled APIs returned empty/unavailable responses");
  }
}

function startRefreshPolling() {
  if (refreshPollTimer) {
    clearTimeout(refreshPollTimer);
    refreshPollTimer = null;
  }

  const run = async () => {
    try {
      await refreshData();
      refreshPollDelayMs = REFRESH_POLL_MIN_MS;
    } catch (err) {
      addTimelineEvent("system", `Polling error: ${err.message}`);
      refreshPollDelayMs = Math.min(REFRESH_POLL_MAX_MS, Math.max(5000, refreshPollDelayMs * 2));
    } finally {
      refreshPollTimer = setTimeout(run, refreshPollDelayMs);
    }
  };

  refreshPollTimer = setTimeout(run, refreshPollDelayMs);
}

function updateBackendSummaryFallback(health) {
  const badge = document.getElementById("statusBadge");
  badge.textContent = "LIVE";
  badge.className = "badge badge-live";
  document.getElementById("monitorStat").textContent = `Backend: ${health.environment || "incident-response-env"}`;
  document.getElementById("injectorStat").textContent = `Tasks: ${(health.tasks || []).join(", ")}`;
  document.getElementById("adversaryStat").textContent = `Sessions: ${health.active_sessions ?? 0}`;
}

function updateObservationSummary(obs) {
  document.getElementById("epNum").textContent = obs.episode_id || "-";
  document.getElementById("responderStat").textContent = `Step ${obs.step}/${obs.max_steps} | Score ${(obs.current_score || 0).toFixed(3)}`;
  const strategy = obs.debate_strategy || "topology_first";
  const el = document.getElementById("strategyBadge");
  el.innerHTML = `<span class="strategy-badge ${strategy}">${strategy.replace(/_/g, " ")}</span>`;
}

function updateSummary(summary) {
  const badge = document.getElementById("statusBadge");
  badge.textContent = summary.running ? "TRAINING" : "IDLE";
  badge.className = "badge " + (summary.running ? "badge-live" : "badge-idle");
  document.getElementById("epNum").textContent = summary.episode ?? "-";

  const progressPct = Number(summary.progress_pct ?? 0);
  const progressText = `${Math.max(0, Math.min(100, progressPct)).toFixed(0)}%`;
  const trainingBar = document.getElementById("trainingBar");
  if (trainingBar) trainingBar.style.width = progressText;
  const trainingPct = document.getElementById("trainingPct");
  if (trainingPct) trainingPct.textContent = progressText;
  const trainingStatusText = document.getElementById("trainingStatusText");
  if (trainingStatusText) {
    trainingStatusText.textContent = summary.running
      ? "Training in progress and updating live metrics from the backend."
      : "Training is idle. Click Start Training to begin.";
  }
  const trainingEpisode = document.getElementById("trainingEpisode");
  if (trainingEpisode) trainingEpisode.textContent = `Episode ${summary.episode ?? "-"}`;
  const trainingTaskText = document.getElementById("trainingTaskText");
  if (trainingTaskText) trainingTaskText.textContent = `Task: ${summary.task || summary.task_id || "all"}`;
  const trainingUpdatedText = document.getElementById("trainingUpdatedText");
  if (trainingUpdatedText) trainingUpdatedText.textContent = `Updated: ${summary.updated_at ? new Date(summary.updated_at).toLocaleTimeString() : "-"}`;

  const pt = summary.per_task || {};
  let bestR = 0;
  let avgR = 0;
  let trend = "-";
  for (const [, d] of Object.entries(pt)) {
    if (d.best > bestR) bestR = d.best;
    if (d.avg_last10 > avgR) {
      avgR = d.avg_last10;
      trend = d.trend || "-";
    }
  }

  document.getElementById("bestReward").textContent = Number(bestR || 0).toFixed(3);
  document.getElementById("avgReward").textContent = Number(avgR || 0).toFixed(3);
  const icons = { improving: "Up", declining: "Down", stable: "Flat", insufficient_data: "Wait" };
  document.getElementById("trendIcon").textContent = `${icons[trend] || "-"} ${trend || ""}`;

  const ev = summary.evaluation || {};
  const ma = ev.multi_agent_dynamics || {};
  document.getElementById("monitorStat").textContent = `Signals sent: ${ma.monitor_signals || 0}`;
  document.getElementById("injectorStat").textContent = `Faults injected: ${ma.fault_injections || 0}`;
  document.getElementById("adversaryStat").textContent = `Evidence corruptions: ${ma.evidence_corruptions || 0}`;

  const trainingSummaryText = document.getElementById("trainingSummaryText");
  if (trainingSummaryText) {
    trainingSummaryText.textContent = `Best reward ${Number(bestR || 0).toFixed(3)} | Avg last 10 ${Number(avgR || 0).toFixed(3)}`;
  }
}

function updateChart(curves) {
  if (!rewardChart || !curves) return;
  const maxLen = Math.max(...Object.values(curves).map((c) => (c.smoothed || []).length), 0);
  rewardChart.data.labels = Array.from({ length: maxLen }, (_, i) => i);
  const taskMap = { easy: 0, medium: 1, hard: 2 };
  for (const [task, idx] of Object.entries(taskMap)) {
    const c = curves[task];
    rewardChart.data.datasets[idx].data = c ? c.smoothed || [] : [];
  }
  rewardChart.update("none");
}

function updateEvaluation(ev) {
  if (!ev || ev.status) return;
  const st = ev.strategy_detected || {};
  const primary = st.primary || "unknown";
  const el = document.getElementById("strategyBadge");
  el.innerHTML = `<span class="strategy-badge ${primary}">${primary.replace(/_/g, " ")}</span>
    <span style="font-size:.65rem;color:var(--text3);margin-left:6px">strength: ${((st.strength || 0) * 100).toFixed(0)}%</span>`;

  addTimelineEvent("system", `Strategy detected: ${primary.replace(/_/g, " ")} (${((st.strength || 0) * 100).toFixed(0)}%)`);
}

function updateCurriculum(cur) {
  if (!cur || cur.status) return;
  const state = cur.state || cur;
  const diff = state.difficulty || "easy";
  document.getElementById("curriculumInfo").textContent =
    `Difficulty: ${diff.toUpperCase()} | Noise: ${(state.noise_multiplier || 1).toFixed(1)}x | Adversary budget: ${state.adversary_budget || 0} | Fault budget: ${state.fault_budget || 0}`;

  ["easy", "medium", "hard"].forEach((d) => {
    const el = document.getElementById("cur" + d.charAt(0).toUpperCase() + d.slice(1));
    el.classList.toggle("active", d === diff);
  });
}

function addTimelineEvent(type, msg) {
  const tl = document.getElementById("timeline");
  const el = document.createElement("div");
  el.className = "event fade-in";
  const now = new Date();
  el.innerHTML = `<div class="event-dot ${type}"></div><div class="event-time">${now.toLocaleTimeString().slice(0, 5)}</div><div class="event-msg">${msg}</div>`;
  tl.prepend(el);
  if (tl.children.length > 50) tl.removeChild(tl.lastChild);
}

function updateTopologyFromObservation(obs) {
  const metrics = obs?.metrics || {};
  const metricByService = Object.fromEntries(Object.entries(metrics));
  renderTopology(metricByService);
}

function renderTopology(metricByService = {}) {
  const container = document.getElementById("topoContainer");
  if (!container) return;

  const w = container.clientWidth;
  const h = container.clientHeight;
  const services = [
    { id: "storefront-ui", x: 0.12, y: 0.3 },
    { id: "api-gateway", x: 0.30, y: 0.3 },
    { id: "auth-service", x: 0.30, y: 0.7 },
    { id: "user-service", x: 0.50, y: 0.7 },
    { id: "order-service", x: 0.50, y: 0.3 },
    { id: "payments-api", x: 0.68, y: 0.3 },
    { id: "payments-db", x: 0.85, y: 0.3 },
    { id: "cache-service", x: 0.68, y: 0.7 },
    { id: "notification-svc", x: 0.85, y: 0.7 },
  ];
  const edges = [
    ["storefront-ui", "api-gateway"], ["api-gateway", "auth-service"], ["auth-service", "user-service"],
    ["api-gateway", "order-service"], ["order-service", "payments-api"], ["payments-api", "payments-db"],
    ["cache-service", "payments-db"],
  ];
  const statusColors = { healthy: "#06d6a0", degraded: "#f59e0b", critical: "#ef4444", failing: "#ef4444" };

  let svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
  const svcMap = {};
  services.forEach((s) => { svcMap[s.id] = { x: s.x * w, y: s.y * h }; });
  edges.forEach(([a, b]) => {
    if (svcMap[a] && svcMap[b]) {
      svg += `<line x1="${svcMap[a].x}" y1="${svcMap[a].y}" x2="${svcMap[b].x}" y2="${svcMap[b].y}" stroke="rgba(99,102,241,.25)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    }
  });

  services.forEach((s) => {
    const m = metricByService[s.id] || {};
    const status = m.status || (m.is_healthy === false ? "degraded" : "healthy");
    const cx = s.x * w;
    const cy = s.y * h;
    const r = 22;
    const col = statusColors[status] || statusColors.healthy;

    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(17,24,39,.9)" stroke="${col}" stroke-width="2"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="${col}" stroke-width="0.5" opacity="0.3"/>`;
    svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="svc-label">${s.id.split("-")[0]}</text>`;
    svg += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" class="svc-status">${status}</text>`;
  });

  svg += "</svg>";
  container.innerHTML = svg;
}

async function startTraining() {
  const response = await fetch(API + "/train/start-multi-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "all", episodes: 100, curriculum: true }),
  }).catch(() => null);

  if (response && response.ok) {
    addTimelineEvent("system", "Training started - 100 episodes, adaptive curriculum, 4 agents");
    const badge = document.getElementById("statusBadge");
    if (badge) {
      badge.textContent = "TRAINING";
      badge.className = "badge badge-live";
    }
    const trainingStatusText = document.getElementById("trainingStatusText");
    if (trainingStatusText) trainingStatusText.textContent = "Training request accepted. Polling backend for progress...";
    refreshPollDelayMs = REFRESH_POLL_MIN_MS;
    startRefreshPolling();
  } else {
    addTimelineEvent("system", "Training endpoint unavailable in backend, continuing live observation mode");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initChart();
  renderTopology();
  refreshPollDelayMs = REFRESH_POLL_MIN_MS;
  startRefreshPolling();
  addTimelineEvent("system", "Dashboard initialized - Multi-Agent Incident Response AI");
  addTimelineEvent("system", "Agents ready: Responder, Monitor, Fault Injector, Adversary");
});

window.addEventListener("resize", () => renderTopology(currentObservation?.metrics || {}));
window.startTraining = startTraining;
window.refreshData = refreshData;
