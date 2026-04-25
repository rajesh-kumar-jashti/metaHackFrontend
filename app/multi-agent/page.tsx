import Script from "next/script";
import "./multi-agent.css";

const DASHBOARD_MARKUP = `
<header>
  <h1>Incident Response AI - Multi-Agent Training</h1>
  <div class="header-right">
    <span id="statusBadge" class="badge badge-idle">IDLE</span>
    <button class="btn btn-primary" onclick="startTraining()">Start Training</button>
    <button class="btn" onclick="refreshData()">Refresh</button>
  </div>
</header>

<div class="grid">
  <div class="panel" id="timelinePanel">
    <div class="panel-title"><span class="dot" style="background:var(--blue)"></span> Agent Activity Timeline</div>
    <div class="panel-body" id="timeline"></div>
  </div>

  <div class="panel" id="agentPanel">
    <div class="panel-title"><span class="dot" style="background:var(--purple)"></span> Multi-Agent Decision View</div>
    <div class="panel-body" id="agentView">
      <div class="metric-row">
        <div class="metric-card"><div class="metric-label">Episode</div><div class="metric-value mono" id="epNum">-</div></div>
        <div class="metric-card"><div class="metric-label">Best Reward</div><div class="metric-value mono" id="bestReward">-</div></div>
        <div class="metric-card"><div class="metric-label">Avg (10)</div><div class="metric-value mono" id="avgReward">-</div></div>
        <div class="metric-card"><div class="metric-label">Trend</div><div class="metric-value" id="trendIcon">-</div></div>
      </div>
      <div class="agent-card responder"><div class="agent-name" style="color:var(--purple)">Responder Agent</div><div class="agent-stat" id="responderStat">Waiting...</div></div>
      <div class="agent-card monitor"><div class="agent-name" style="color:var(--cyan)">Monitor Agent</div><div class="agent-stat" id="monitorStat">Waiting...</div></div>
      <div class="agent-card injector"><div class="agent-name" style="color:var(--orange)">Fault Injector</div><div class="agent-stat" id="injectorStat">Waiting...</div></div>
      <div class="agent-card adversary"><div class="agent-name" style="color:var(--red)">Adversarial Agent</div><div class="agent-stat" id="adversaryStat">Waiting...</div></div>
      <div style="margin-top:8px">
        <div class="metric-label">Detected Strategy</div>
        <div id="strategyBadge" style="margin-top:4px"><span class="strategy-badge">-</span></div>
      </div>
    </div>
  </div>

  <div class="panel" id="rewardPanel">
    <div class="panel-title"><span class="dot" style="background:var(--cyan)"></span> Reward Progression</div>
    <div style="margin-bottom:8px">
      <div class="metric-label">Adaptive Curriculum</div>
      <div class="curriculum-bar">
        <div class="curriculum-seg easy" id="curEasy" style="flex:1">EASY</div>
        <div class="curriculum-seg medium" id="curMedium" style="flex:1">MEDIUM</div>
        <div class="curriculum-seg hard" id="curHard" style="flex:1">HARD</div>
      </div>
      <div class="metric-sub" id="curriculumInfo">Difficulty: -</div>
    </div>
    <div class="chart-wrap"><canvas id="rewardChart"></canvas></div>
  </div>

  <div class="panel panel-topology" id="topoPanel">
    <div class="panel-title"><span class="dot" style="background:var(--orange)"></span> Service Topology and Health</div>
    <div class="panel-body topo-container" id="topoContainer"></div>
  </div>
</div>
`;

export default function MultiAgentDashboardPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: DASHBOARD_MARKUP }} />
      <Script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" strategy="afterInteractive" />
      <Script src="/multi-agent-dashboard.js" strategy="lazyOnload" />
    </>
  );
}
