import Script from "next/script";
import "./sentinel.css";
import IncidentResponseApp from "./components/IncidentResponseApp";

const SENTINEL_MARKUP = `
<div class="glow-1"></div>
<div class="glow-2"></div>
<div class="glow-3"></div>

<header>
  <div class="logo-block">
    <div>
      <div class="logo-text">SENTINEL</div>
      <div class="logo-sub">AI Incident Response</div>
    </div>
  </div>
  <div class="status-strip">
    <div class="status-item">
      <div class="dot dot-green"></div>
      <span class="status-label text-volt">Daemon Active</span>
    </div>
    <div class="status-item" id="faultItem" style="display:none">
      <div class="dot dot-red"></div>
      <span class="status-label text-fire">Fault Detected</span>
    </div>
    <div class="status-item" id="trainItem" style="display:none">
      <div class="dot dot-amber"></div>
      <span class="status-label text-amber">Training Running</span>
    </div>
  </div>
  <div class="header-right">
    <span class="hdr-time mono" id="clock">-</span>
    <button class="chip chip-volt" onclick="injectFault()">INJECT FAULT</button>
    <button class="chip chip-red" onclick="clearFault()">CLEAR</button>
    <button class="chip chip-cyan" onclick="startTraining()">TRAIN</button>
  </div>
</header>

<nav>
  <button class="nav-btn active" onclick="showTab('monitor',this)">MONITOR</button>
  <button class="nav-btn" onclick="showTab('training',this)">TRAINING<span class="badge" id="trainBadge" style="display:none">!</span></button>
  <button class="nav-btn" onclick="showTab('incidents',this)">INCIDENTS<span class="badge" id="incBadge" style="display:none">0</span></button>
  <button class="nav-btn" onclick="showTab('reports',this)">REPORTS</button>
  <button class="nav-btn" onclick="showTab('analyze',this)">ANALYZE</button>
</nav>

<main>
  <div id="tab-monitor" class="tab-content active">
    <div class="kpi-strip mb16">
      <div class="kpi">
        <div class="kpi-bar" style="background:var(--volt)"></div>
        <div class="kpi-label">Healthy Services</div>
        <div class="kpi-value text-volt" id="kpiHealthy">-</div>
        <div class="kpi-sub">of <span id="kpiTotal">9</span></div>
      </div>
      <div class="kpi">
        <div class="kpi-bar" style="background:var(--fire)"></div>
        <div class="kpi-label">Active Alerts</div>
        <div class="kpi-value text-fire" id="kpiAlerts">0</div>
        <div class="kpi-sub" id="kpiAlertSub">system nominal</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar" style="background:var(--electric)"></div>
        <div class="kpi-label">Incidents Detected</div>
        <div class="kpi-value text-cyan" id="kpiInc">0</div>
        <div class="kpi-sub">this session</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar" style="background:var(--amber)"></div>
        <div class="kpi-label">RCA Confidence</div>
        <div class="kpi-value text-amber" id="kpiConf">-</div>
        <div class="kpi-sub">avg across incidents</div>
      </div>
      <div class="kpi">
        <div class="kpi-bar" style="background:var(--purple)"></div>
        <div class="kpi-label">Training Episodes</div>
        <div class="kpi-value text-purple" id="kpiEps">0</div>
        <div class="kpi-sub">completed</div>
      </div>
    </div>

    <div class="g21 mb16">
      <div class="card">
        <div class="card-head">
          <span class="card-title">Service Health Matrix</span>
          <span class="mono text-muted" id="svcTime" style="font-size:9px">-</span>
        </div>
        <div class="svc-grid" id="svcGrid"></div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Alert Feed</span>
          <span class="mono text-muted" id="alertCnt" style="font-size:9px">0 alerts</span>
        </div>
        <div class="alert-feed" id="alertFeed">
          <div class="text-muted" style="text-align:center;padding:24px;font-size:11px">System nominal - no alerts</div>
        </div>
      </div>
    </div>

    <div class="g3 mb16">
      <div class="card">
        <div class="card-head"><span class="card-title">CPU Utilization</span></div>
        <div class="chart-wrap h180"><canvas id="cpuChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Memory Utilization</span></div>
        <div class="chart-wrap h180"><canvas id="memChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">HTTP Response Time (ms)</span></div>
        <div class="chart-wrap h180"><canvas id="rtChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-title">Recent Incidents</span>
        <button class="btn btn-secondary btn-sm" onclick="showTab('incidents',document.querySelectorAll('.nav-btn')[2])">View All -></button>
      </div>
      <div id="recentInc" class="incident-list"></div>
    </div>
  </div>

  <div id="tab-training" class="tab-content">
    <div class="g2 mb16">
      <div class="card">
        <div class="card-head"><span class="card-title">Training Configuration</span></div>
        <div class="train-form">
          <div class="form-group">
            <span class="form-label">Task Scope</span>
            <select id="trainTask">
              <option value="all">All Tasks - Easy + Medium + Hard</option>
              <option value="easy">Easy Only</option>
              <option value="medium">Medium Only</option>
              <option value="hard">Hard Only</option>
            </select>
          </div>
          <div class="form-group">
            <span class="form-label">Episodes: <span id="epVal" class="text-cyan">100</span></span>
            <input type="range" id="trainEps" min="20" max="500" value="100" step="10" oninput="document.getElementById('epVal').textContent=this.value">
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="useCurriculum" checked>
            <span class="form-label" style="margin:0">Curriculum Learning (Easy -> Medium -> Hard)</span>
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="useChallenger" checked>
            <span class="form-label" style="margin:0">Multi-Agent Challenger Loop</span>
          </div>
          <div class="flex gap8">
            <button class="btn btn-primary" onclick="launchTraining()">START TRAINING</button>
            <button class="btn btn-secondary" onclick="loadTrainingCurves()">LOAD LOGS</button>
          </div>
          <div id="trainProg" class="hidden">
            <div class="flex justify-between mb12">
              <span class="mono text-muted" style="font-size:10px">Progress</span>
              <span class="mono text-cyan" style="font-size:10px" id="trainPct">0%</span>
            </div>
            <div class="prog-track"><div class="prog-fill" id="trainBar" style="width:0"></div></div>
            <div class="flex justify-between mt12">
              <span class="mono text-muted" style="font-size:10px">Episode <span id="trainEpNum">0</span></span>
              <span class="mono text-muted" style="font-size:10px">ETA <span id="trainETA">-</span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Agent Performance</span></div>
        <div class="score-boxes mb12">
          <div class="score-box">
            <div class="score-task">Easy</div>
            <div class="score-val text-volt" id="scEasy">0.00</div>
            <div class="score-best">best: <span id="bestEasy" class="text-cyan">-</span></div>
          </div>
          <div class="score-box">
            <div class="score-task">Medium</div>
            <div class="score-val text-amber" id="scMed">0.00</div>
            <div class="score-best">best: <span id="bestMed" class="text-cyan">-</span></div>
          </div>
          <div class="score-box">
            <div class="score-task">Hard</div>
            <div class="score-val text-fire" id="scHard">0.00</div>
            <div class="score-best">best: <span id="bestHard" class="text-cyan">-</span></div>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat">
            <div class="stat-val text-cyan" id="statEps">0</div>
            <div class="stat-label">Episodes</div>
          </div>
          <div class="stat">
            <div class="stat-val text-purple" id="statChal">0</div>
            <div class="stat-label">Challenger Wins</div>
          </div>
          <div class="stat">
            <div class="stat-val text-volt" id="statAvg">0.00</div>
            <div class="stat-label">Avg Reward</div>
          </div>
        </div>
      </div>
    </div>

    <div class="g2 mb16">
      <div class="card">
        <div class="card-head">
          <span class="card-title">Reward Curves - All Tasks</span>
          <span class="mono text-muted" style="font-size:9px">Rolling avg (window=10)</span>
        </div>
        <div class="chart-wrap h260"><canvas id="rewardChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head">
          <span class="card-title">Component Breakdown per Episode</span>
        </div>
        <div class="chart-wrap h260"><canvas id="componentChart"></canvas></div>
      </div>
    </div>

    <div class="g3 mb16">
      <div class="card">
        <div class="card-head"><span class="card-title">Root Cause Accuracy</span></div>
        <div class="chart-wrap h180"><canvas id="rcChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Challenger Win Rate</span></div>
        <div class="chart-wrap h180"><canvas id="chalChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Speed Bonus (Steps to Solve)</span></div>
        <div class="chart-wrap h180"><canvas id="speedChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <span class="card-title">Training Log</span>
        <button class="btn btn-secondary btn-sm" onclick="clearTerm()">CLR</button>
      </div>
      <div class="terminal" id="trainTerm">
        <div class="tl"><span class="ts">-</span><span class="t-info">Awaiting training start...</span></div>
      </div>
    </div>
  </div>

  <div id="tab-incidents" class="tab-content">
    <div class="g21">
      <div class="card">
        <div class="card-head">
          <span class="card-title">All Incidents</span>
          <span class="mono text-muted" style="font-size:10px" id="incTotal">0 total</span>
        </div>
        <div id="incidentList" class="incident-list" style="max-height:620px;overflow-y:auto"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <div class="card-head"><span class="card-title">Severity Distribution</span></div>
          <div class="chart-wrap h180"><canvas id="sevChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><span class="card-title">Fault Type Distribution</span></div>
          <div class="chart-wrap h180"><canvas id="ftChart"></canvas></div>
        </div>
      </div>
    </div>
  </div>

  <div id="tab-reports" class="tab-content">
    <div class="card">
      <div class="card-head">
        <span class="card-title">Incident Reports</span>
        <div class="flex gap8">
          <button class="btn btn-secondary btn-sm" onclick="renderReports()">REFRESH</button>
          <button class="btn btn-secondary btn-sm" onclick="exportReports()">EXPORT</button>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Report ID</th><th>Sev</th><th>Root Cause</th><th>Fault</th><th>Action</th><th>Confidence</th><th>Time</th><th></th></tr>
        </thead>
        <tbody id="reportsTbody"></tbody>
      </table>
    </div>
  </div>


</main>

<div class="detail-overlay" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-panel" id="detailPanel"></div>
</div>
`;

export default function Home() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: SENTINEL_MARKUP }} />
      <div id="tab-analyze" className="tab-content">
        <IncidentResponseApp />
      </div>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" strategy="afterInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" strategy="afterInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js" strategy="afterInteractive" />
      <Script src="/sentinel.js" strategy="lazyOnload" />
    </>
  );
}
