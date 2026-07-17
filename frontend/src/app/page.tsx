import Link from 'next/link';
import {
  Activity, ArrowRight, BellRing, Check, ChevronRight, Command, Cpu,
  Database, Globe2, HardDrive, Radio, Server, ShieldCheck, Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const signal = [34, 46, 39, 54, 49, 68, 52, 73, 59, 65, 48, 57, 41, 63, 52, 70, 58, 76];

export default function LandingPage() {
  return (
    <div className="landing-liquid min-h-screen overflow-hidden text-[#f5f7fb]">
      <div className="landing-noise" aria-hidden="true" />

      <header className="landing-header">
        <Link href="/" className="flex items-center gap-3">
          <span className="brand-orbit"><Command className="h-4 w-4" /></span>
          <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[#86f2cf]">OPS</span></span>
        </Link>
        <nav className="hidden items-center gap-7 text-[11px] text-white/45 md:flex">
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#workflow" className="transition hover:text-white">Workflow</a>
          <a href="#agents" className="transition hover:text-white">Agent</a>
          <Link href="/docs" className="transition hover:text-white">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden px-3 py-2 text-[11px] text-white/50 transition hover:text-white sm:block">Sign in</Link>
          <Link href="/register" className="landing-pill">Start monitoring <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-liquid-orb" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <div className="landing-badge"><Radio className="h-3 w-3" />Agent network is operational</div>
            <h1>See every signal.<br /><em>Control every server.</em></h1>
            <p>One quiet control plane for your entire infrastructure. DatrixOps turns lightweight agent telemetry into clear answers before incidents become outages.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="landing-cta primary">Connect your first server <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/dashboard" className="landing-cta secondary">Explore the control plane <ChevronRight className="h-4 w-4" /></Link>
            </div>
          </div>

          <div className="hero-console-wrap">
            <div className="hero-console">
              <div className="console-topbar">
                <div className="flex gap-1.5"><i /><i /><i /></div>
                <div className="console-address"><ShieldCheck className="h-2.5 w-2.5 text-[#7af0c9]" />app.datrixops.io / production</div>
                <span className="text-[8px] text-[#7af0c9]">● LIVE</span>
              </div>
              <div className="console-body">
                <aside className="console-rail">
                  <Command className="h-4 w-4 text-white/70" />
                  {[Activity, Server, BellRing, Globe2].map((Icon, index) => <span className={index === 0 ? 'active' : ''} key={index}><Icon className="h-3.5 w-3.5" /></span>)}
                </aside>
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <div className="mb-5 flex items-end justify-between">
                    <div><p className="text-[7px] uppercase tracking-[.2em] text-[#7af0c9]">Live infrastructure</p><h2 className="mt-1 text-sm font-medium">Production overview</h2></div>
                    <span className="console-button"><span className="h-1.5 w-1.5 rounded-full bg-[#7af0c9]" />12 agents</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <ConsoleMetric icon={Server} label="Online" value="11/12" tint="#7af0c9" />
                    <ConsoleMetric icon={Cpu} label="Avg. CPU" value="41%" tint="#a99cff" />
                    <ConsoleMetric icon={BellRing} label="Incidents" value="02" tint="#ff91a4" />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1.55fr_.8fr]">
                    <div className="console-chart">
                      <div className="flex items-center justify-between"><span>Resource load</span><span className="font-mono text-[7px] text-white/25">LAST 2 HOURS</span></div>
                      <div className="signal-bars">{signal.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
                    </div>
                    <div className="console-health">
                      <span>Fleet health</span>
                      <div className="mini-health-ring"><b>92%</b></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-8 text-center text-[9px] uppercase tracking-[.22em] text-white/22">Built for physical servers · VPS · cloud instances · containers</p>
        </section>

        <section className="landing-proof">
          <div><strong>10 sec</strong><span>Metric interval</span></div>
          <div><strong>&lt; 3 sec</strong><span>Alert latency</span></div>
          <div><strong>24 / 7</strong><span>Fleet visibility</span></div>
          <div><strong>1 command</strong><span>Agent install</span></div>
        </section>

        <section id="platform" className="landing-section">
          <div className="landing-section-head">
            <span>One operational picture</span>
            <h2>Deep visibility.<br /><em>Zero visual noise.</em></h2>
            <p>Every screen is organized around decisions your ops team actually makes—not around disconnected metrics.</p>
          </div>

          <div className="feature-showcase">
            <div className="feature-copy">
              <span className="feature-number">01 / Observe</span>
              <h3>Your whole fleet,<br />in a single pulse.</h3>
              <p>See health, CPU, memory, disks, network and agent status together. Move from fleet-level anomalies to a single server without losing context.</p>
              <Link href="/dashboard" className="feature-link">Open live overview <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="liquid-demo violet">
              <div className="demo-toolbar"><Activity className="h-3.5 w-3.5" /><span>Fleet telemetry</span><i>LIVE</i></div>
              <div className="demo-wave">
                <svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true">
                  <defs><linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8f80ff" stopOpacity=".6" /><stop offset="1" stopColor="#8f80ff" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 145 C50 130,60 95,110 110 S170 155,210 100 S275 60,315 96 S380 140,425 73 S500 42,540 83 S580 110,600 38 L600 180 L0 180Z" fill="url(#waveFill)" />
                  <path d="M0 145 C50 130,60 95,110 110 S170 155,210 100 S275 60,315 96 S380 140,425 73 S500 42,540 83 S580 110,600 38" fill="none" stroke="#a99cff" strokeWidth="3" />
                </svg>
              </div>
              <div className="demo-metrics"><span><b>41%</b> CPU</span><span><b>60%</b> Memory</span><span><b>2.4 Gb/s</b> Network</span></div>
            </div>
          </div>

          <div className="feature-showcase reverse">
            <div className="feature-copy">
              <span className="feature-number">02 / Act</span>
              <h3>Incidents arrive<br />with context attached.</h3>
              <p>Threshold rules turn telemetry into focused incidents. Know what failed, where it happened and which signal crossed the line before you open a terminal.</p>
              <Link href="/dashboard/alerts" className="feature-link">Explore incident center <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="liquid-demo teal">
              <div className="demo-toolbar"><BellRing className="h-3.5 w-3.5" /><span>Incident stream</span><i>2 OPEN</i></div>
              <div className="alert-stack">
                <DemoAlert icon={Database} title="Memory threshold exceeded" server="db-primary-01" tone="red" />
                <DemoAlert icon={HardDrive} title="Disk pressure detected" server="worker-sg-03" tone="amber" />
                <DemoAlert icon={Check} title="CPU load recovered" server="api-prod-02" tone="green" />
              </div>
            </div>
          </div>
        </section>

        <section id="agents" className="agent-section">
          <div className="agent-glow" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <span className="landing-badge"><Terminal className="h-3 w-3" />Native Go agent</span>
            <h2>Light on every server.<br /><em>Heavy on insight.</em></h2>
            <p>A small, dependency-free agent reports the signals that matter without becoming another workload you need to babysit.</p>
            <div className="install-command"><code><span>$</span> curl -sSL datrixops.io/install.sh | sudo bash</code><button aria-label="Copy command">Copy</button></div>
            <Link href="/docs" className="landing-cta secondary mt-5">Read installation guide <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        <section id="workflow" className="workflow-section">
          <div className="landing-section-head">
            <span>From zero to signal</span>
            <h2>Connect. Watch.<br /><em>Respond.</em></h2>
          </div>
          <div className="workflow-grid">
            <WorkflowItem number="01" icon={Terminal} title="Install agent" text="Run one command on any Linux server. The agent registers itself securely." />
            <WorkflowItem number="02" icon={Activity} title="Stream telemetry" text="Resource and availability signals appear in your control plane automatically." />
            <WorkflowItem number="03" icon={BellRing} title="Set guardrails" text="Create thresholds for the systems and services that matter to your team." />
            <WorkflowItem number="04" icon={ShieldCheck} title="Resolve early" text="Follow precise alerts and recover before your customers notice a thing." />
          </div>
        </section>

        <section className="landing-final">
          <div className="final-orb" aria-hidden="true" />
          <div className="relative z-10">
            <span className="text-[9px] uppercase tracking-[.25em] text-[#8ef0d0]">Your infrastructure is speaking</span>
            <h2>Start listening<br /><em>before it gets loud.</em></h2>
            <p>Connect your first server in minutes. No credit card, no complicated collectors.</p>
            <Link href="/register" className="landing-cta primary mt-7">Start monitoring free <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="flex items-center gap-2"><Command className="h-4 w-4" /><span>DATRIXOPS</span></div>
        <p>Quiet infrastructure. Confident teams.</p>
        <div className="flex gap-5"><Link href="/docs">Docs</Link><Link href="/login">Sign in</Link></div>
      </footer>
    </div>
  );
}

function ConsoleMetric({ icon: Icon, label, value, tint }: { icon: LucideIcon; label: string; value: string; tint: string }) {
  return <div className="console-metric"><div style={{ color: tint }}><Icon className="h-3 w-3" />{label}</div><strong>{value}</strong></div>;
}

function DemoAlert({ icon: Icon, title, server, tone }: { icon: LucideIcon; title: string; server: string; tone: string }) {
  return <div className="demo-alert"><span className={`demo-alert-icon ${tone}`}><Icon className="h-4 w-4" /></span><div><b>{title}</b><p>{server} · just now</p></div><ChevronRight className="ml-auto h-4 w-4 text-white/20" /></div>;
}

function WorkflowItem({ number, icon: Icon, title, text }: { number: string; icon: LucideIcon; title: string; text: string }) {
  return <div className="workflow-item"><div className="flex items-start justify-between"><span>{number}</span><Icon className="h-5 w-5 text-[#998cff]" /></div><h3>{title}</h3><p>{text}</p></div>;
}
