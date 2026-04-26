"use client";
import { useState, useEffect, useMemo } from 'react';
import { Mail, Activity, ShieldAlert, Cpu, HeartPulse, RefreshCw, AlertTriangle, Users, Trophy, ChevronRight, Play, BookOpen } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const API = 'http://localhost:3000';

const AGENT_ROLES = {
  orchestrator: "Manages all agents and curriculum",
  email_agent: "Simulates and parses incoming emails",
  log_analyst: "Classifies logs and fault types",
  responder: "Diagnoses issue and prescribes action",
  monitor: "Detects system anomalies",
  adversary: "Corrupts evidence to confuse responder",
  fault_injector: "Injects secondary failures"
};

export default function IncidentResponseApp() {
  const [emails, setEmails] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [health, setHealth] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('IDLE');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [trainingStatus, setTrainingStatus] = useState({ status: 'idle' });
  const [trainingCurves, setTrainingCurves] = useState([]);
  const [showTrainingChart, setShowTrainingChart] = useState(false);

  useEffect(() => {
    let ws;
    const connect = () => {
      ws = new WebSocket('ws://localhost:8000/ws');
      ws.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        handleEvent(ev);
      };
      ws.onclose = () => setTimeout(connect, 2000);
    };
    connect();

    // Poll for training status and curves
    const pollTraining = async () => {
      try {
        const res = await fetch(`${API}/api/training/status`);
        const ts = await res.json();
        setTrainingStatus(ts);
        
        const curveRes = await fetch(`${API}/api/training/curves`);
        const cd = await curveRes.json();
        if (cd && cd.curves) {
          const hist = cd.curves;
          const len = Math.max((hist.easy||{smoothed:[]}).smoothed.length, (hist.medium||{smoothed:[]}).smoothed.length, (hist.hard||{smoothed:[]}).smoothed.length, 0);
          const cdata = Array.from({length: len}, (_, i) => ({
            step: i + 1,
            easy: hist.easy?.smoothed[i] || 0,
            medium: hist.medium?.smoothed[i] || 0,
            hard: hist.hard?.smoothed[i] || 0
          }));
          setTrainingCurves(cdata);
        }
      } catch (e) { }
    };
    const pInt = setInterval(pollTraining, 2000);

    return () => {
      ws?.close();
      clearInterval(pInt);
    };
  }, []);

  const handleEvent = (ev) => {
    if (ev.type === 'CONNECTED') {
      if (ev.health) setHealth(ev.health);
      if (ev.emails) setEmails(ev.emails);
    } else if (ev.type === 'HEALTH_UPDATE') {
      setHealth(ev.health);
    } else if (ev.type === 'EMAIL_RECEIVED') {
      setEmails(prev => [ev.email, ...prev]);
      setSelectedEmail(ev.email);
      addTimeline('EMAIL RECEIVED', 'Email Agent', ev.message, 'bg-blue-500/20 text-blue-400 border-blue-500');
    } else if (ev.type === 'EMAIL_PARSED') {
      addTimeline('PARSED', 'Email Agent', ev.message, 'bg-blue-500/20 text-blue-400 border-blue-500');
    } else if (ev.type === 'LOG_ANALYSIS_COMPLETE') {
      addTimeline('LOG ANALYSIS', 'Log Analyst', ev.message, 'bg-emerald-500/20 text-emerald-400 border-emerald-500');
      setStatus('RUNNING');
    } else if (ev.type === 'ENV_READY') {
      addTimeline('ENV READY', 'Orchestrator', ev.message, 'bg-purple-500/20 text-purple-400 border-purple-500');
    } else if (ev.type === 'STEP_COMPLETE') {
      let r = ev.reward || 0;
      let color = r >= 0.7 ? 'bg-emerald-500/20 text-emerald-400' : r >= 0.4 ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400';
      addTimeline(`STEP ${ev.ep_step}/${ev.max_steps}`, 'Multi-Agent', ev.message, `${color} border-current`);
    } else if (ev.type === 'EPISODE_COMPLETE') {
      setStatus('IDLE');
      addTimeline('RESOLVED', 'System', ev.message, 'bg-emerald-500/20 text-emerald-400 border-emerald-500');
      if (ev.health) setHealth(ev.health);
      setSummary(ev);
    } else if (ev.type === 'REWARDS_UPDATED') {
      const hist = ev.reward_history;
      const len = Math.max((hist.easy||[]).length, (hist.medium||[]).length, (hist.hard||[]).length);
      const data = Array.from({length: len}, (_, i) => ({
        step: i + 1,
        easy: hist.easy[i] || 0,
        medium: hist.medium[i] || 0,
        hard: hist.hard[i] || 0
      }));
      setRewards(data);
    } else if (ev.type === 'ERROR') {
      addTimeline('ERROR', 'System', ev.message, 'bg-red-500/20 text-red-400 border-red-500');
      setStatus('IDLE');
    }
  };

  const addTimeline = (type, agent, msg, styleClass) => {
    setTimeline(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString(),
      type, agent, msg, styleClass
    }, ...prev].slice(0, 50));
  };

  const simulate = async (scenario) => {
    if (status === 'RUNNING') return;
    try {
      await fetch(`${API}/api/email/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
    } catch (e) {
      addTimeline('ERROR', 'System', 'Cannot reach backend.', 'bg-red-500/20 text-red-400 border-red-500');
    }
  };

  const startTraining = async () => {
    try {
      await fetch(`${API}/api/training/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'simulate', episodes: 50, task: 'all', curriculum: true })
      });
      setShowTrainingChart(true);
    } catch (e) {
      addTimeline('ERROR', 'System', 'Cannot reach backend to start training.', 'bg-red-500/20 text-red-400 border-red-500');
    }
  };

  const rankedAgents = useMemo(() => {
    if (!health || !health.agents) return [];
    return Object.values(health.agents).sort((a, b) => b.efficiency_score - a.efficiency_score);
  }, [health]);

  const activeCount = rankedAgents.filter(a => a.status === 'active').length;

  return (
    <div className="bg-slate-950 text-slate-200 font-sans p-4 space-y-4 h-full" style={{minHeight: "600px"}}>
      
      {/* HEADER */}
      <header className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-purple-400" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-purple-400 bg-clip-text text-transparent">
            Incident Response AI
          </h1>
          <span className={`ml-4 px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-2 ${
            status === 'RUNNING' ? 'bg-red-500/20 text-red-400 border-red-500 animate-pulse' : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {status === 'RUNNING' && <AlertTriangle size={14} />}
            {status === 'RUNNING' ? 'PRODUCTION ISSUE DETECTED' : 'SYSTEM IDLE'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <Users size={16} className="text-cyan-400" /> 
            <span className="font-bold text-slate-200">{activeCount}</span> Agents Active
          </div>
          <div className="flex gap-2">
            <button onClick={startTraining} disabled={trainingStatus.status === 'running'} className="px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2">
              <BookOpen size={16} /> Train Agent
            </button>
            <div className="w-px h-8 bg-slate-800 mx-2 self-center"></div>
            <button onClick={() => simulate('easy')} disabled={status === 'RUNNING'} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-sm font-semibold transition disabled:opacity-50">
              Simulate Easy
            </button>
            <button onClick={() => simulate('medium')} disabled={status === 'RUNNING'} className="px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 rounded-lg text-sm font-semibold transition disabled:opacity-50">
              Simulate Medium
            </button>
            <button onClick={() => simulate('hard')} disabled={status === 'RUNNING'} className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-lg text-sm font-semibold transition disabled:opacity-50">
              Simulate Hard
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-120px)]" style={{minHeight: "600px"}}>
        
        {/* LEFT COL: INBOX & EMAIL DETAILS (Span 3) */}
        <div className="col-span-1 lg:col-span-3 flex flex-col gap-4 h-full">
          {/* Inbox */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-1/3">
            <div className="p-3 border-b border-slate-800 flex items-center gap-2 text-slate-400 font-semibold text-xs uppercase tracking-wider">
              <Mail size={14} className="text-blue-400" /> Incident Inbox
            </div>
            <div className="p-3 overflow-y-auto flex-1 space-y-2">
              {emails.length === 0 && <div className="text-center text-slate-500 text-sm py-8">No emails received.</div>}
              {emails.map(em => (
                <div 
                  key={em.id} 
                  onClick={() => setSelectedEmail(em)}
                  className={`p-3 border rounded-lg cursor-pointer transition ${
                    selectedEmail?.id === em.id ? 'bg-blue-500/10 border-blue-500' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="font-semibold text-sm mb-1">{em.subject}</div>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span className="text-purple-400 font-mono">{em.task_id}</span>
                    <span>{new Date(em.received_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Email Body Viewer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-2/3">
            <div className="p-3 border-b border-slate-800 flex items-center gap-2 text-slate-400 font-semibold text-xs uppercase tracking-wider">
              <Mail size={14} className="text-cyan-400" /> Email Contents
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-slate-950 font-mono text-xs leading-relaxed text-slate-300">
              {selectedEmail ? (
                <div>
                  <div className="mb-4 pb-2 border-b border-slate-800">
                    <div className="text-slate-500">From: <span className="text-slate-300">{selectedEmail.sender}</span></div>
                    <div className="text-slate-500">Subject: <span className="text-blue-400 font-bold">{selectedEmail.subject}</span></div>
                  </div>
                  <div className="whitespace-pre-wrap">
                    {selectedEmail.body.split('\n').map((line, i) => {
                      let color = "text-slate-300";
                      if (line.includes("CRIT") || line.includes("P0")) color = "text-red-400 font-bold";
                      else if (line.includes("ERROR") || line.includes("P1")) color = "text-orange-400";
                      else if (line.includes("WARN") || line.includes("P2")) color = "text-yellow-400";
                      return <div key={i} className={color}>{line}</div>;
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-600 mt-10">Select an email to view contents</div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE COL: TIMELINE (Span 5) */}
        <div className="col-span-1 lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full">
          <div className="p-3 border-b border-slate-800 flex items-center gap-2 text-slate-400 font-semibold text-xs uppercase tracking-wider">
            <Activity size={14} className="text-emerald-400" /> Backend Resolution Timeline
          </div>
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {timeline.length === 0 && <div className="text-center text-slate-500 text-sm py-12">Waiting for pipeline events...</div>}
            {timeline.map(item => (
              <div key={item.id} className="flex gap-3 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 border-2 ${item.styleClass}`}></div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${item.styleClass}`}>{item.type}</span>
                      <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                        <ChevronRight size={12} /> {item.agent}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{item.time}</span>
                  </div>
                  <div className="text-sm text-slate-300 leading-snug mt-1 whitespace-pre-wrap">{item.msg}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COL: AGENT RANKING & REWARDS (Span 4) */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-4 h-full">
          
          {/* Agent Ranking */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-1/2">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between text-slate-400 font-semibold text-xs uppercase tracking-wider">
              <div className="flex items-center gap-2"><Trophy size={14} className="text-yellow-400" /> Agent Performance Ranking</div>
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">Live</span>
            </div>
            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {rankedAgents.length === 0 && <div className="text-center text-slate-500 text-sm py-8">No agents initialized.</div>}
              {rankedAgents.map((agent, idx) => (
                <div key={agent.agent_id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                  agent.status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/50'
                }`}>
                  <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 
                    idx === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/50' :
                    idx === 2 ? 'bg-amber-700/20 text-amber-500 border border-amber-700/50' :
                    'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-sm font-semibold truncate" style={{color: agent.color}}>{agent.display_name}</span>
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        agent.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {agent.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mb-1" title={AGENT_ROLES[agent.agent_id]}>
                      Role: {AGENT_ROLES[agent.agent_id]}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full transition-all duration-500" style={{width: `${agent.efficiency_score * 100}%`, backgroundColor: agent.color}}></div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{(agent.efficiency_score * 100).toFixed(0)}% Eff</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reward Chart & Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-1/2">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between text-slate-400 font-semibold text-xs uppercase tracking-wider">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Cpu size={14} className="text-orange-400" /> Reward Curves</div>
                <div className="flex gap-2 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button onClick={() => setShowTrainingChart(false)} className={`px-2 py-1 rounded text-[10px] font-bold ${!showTrainingChart ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>LIVE PIPELINE</button>
                  <button onClick={() => setShowTrainingChart(true)} className={`px-2 py-1 rounded text-[10px] font-bold ${showTrainingChart ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>OFFLINE TRAINING</button>
                </div>
              </div>
              {trainingStatus.status === 'running' && <span className="text-indigo-400 font-mono text-[10px] animate-pulse">Training... Ep {trainingStatus.current_episode}/{trainingStatus.total_episodes}</span>}
              {!showTrainingChart && summary && <span className="text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Reward: {summary.best_reward.toFixed(3)}</span>}
            </div>
            
            <div className="flex-1 p-3 flex flex-col gap-3 min-h-0">
              <div className="flex-1 min-h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={showTrainingChart ? trainingCurves : rewards} margin={{top: 5, right: 5, left: -20, bottom: 0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="step" stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis domain={[0, 1]} stroke="#64748b" fontSize={9} tickLine={false} />
                    <RechartsTooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px'}} />
                    <Line type="monotone" dataKey="easy" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="medium" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="hard" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {!showTrainingChart && summary ? (
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/50 shrink-0">
                  <div className="flex justify-between"><span className="text-slate-500">Task ID:</span> <span className="font-mono text-purple-400">{summary.task_id}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Injections:</span> <span className="text-orange-400 font-bold">{summary.injections}</span></div>
                  <div className="flex justify-between col-span-2"><span className="text-slate-500">Strategy:</span> <span className="text-cyan-400 truncate ml-2">{summary.strategy.replace(/_/g, ' ')}</span></div>
                  <div className="flex justify-between col-span-2"><span className="text-slate-500">Root Cause:</span> <span className="text-slate-200 truncate ml-2">{summary.ground_truth_rc}</span></div>
                </div>
              ) : !showTrainingChart ? (
                <div className="flex items-center justify-center text-slate-500 text-xs h-16 shrink-0 border border-dashed border-slate-800 rounded-lg">No runs completed yet.</div>
              ) : null}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
