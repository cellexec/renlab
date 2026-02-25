"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Animated Number Hook ─────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 800) {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = current;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return current;
}

// ── Sparkline Component ──────────────────────────────────────────────────────

function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "#10b981",
  filled = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height * 0.8) - height * 0.1,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {filled && (
        <defs>
          <linearGradient id={`spark-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {filled && (
        <path
          d={fillPath}
          fill={`url(#spark-fill-${color.replace("#", "")})`}
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

// ── Mini Bar Chart (24h uptime) ──────────────────────────────────────────────

function UptimeBarChart({ data }: { data: number[] }) {
  const maxVal = Math.max(...data);
  return (
    <div className="flex items-end gap-[2px] h-16 w-full">
      {data.map((v, i) => {
        const pct = maxVal > 0 ? (v / maxVal) * 100 : 0;
        const isDown = v < 95;
        return (
          <div
            key={i}
            className="flex-1 rounded-t-[2px] transition-all duration-300"
            style={{
              height: `${Math.max(pct, 4)}%`,
              backgroundColor: isDown
                ? v < 50
                  ? "rgba(239, 68, 68, 0.7)"
                  : "rgba(245, 158, 11, 0.5)"
                : "rgba(16, 185, 129, 0.4)",
            }}
            title={`Hour ${i}: ${v.toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}

// ── Mock Data ────────────────────────────────────────────────────────────────

type ServerStatus = "running" | "stopped";

interface LogEntry {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

const LOG_TEMPLATES: { level: LogEntry["level"]; message: string }[] = [
  { level: "info", message: "GET /api/users 200 12ms" },
  { level: "info", message: "GET /api/projects 200 8ms" },
  { level: "info", message: "POST /api/sessions 201 45ms" },
  { level: "info", message: "GET /api/health 200 2ms" },
  { level: "info", message: "GET /dashboard 200 34ms" },
  { level: "info", message: "WebSocket connection established" },
  { level: "info", message: "GET /api/metrics 200 15ms" },
  { level: "info", message: "Static asset served: bundle.js 304" },
  { level: "info", message: "GET /api/notifications 200 22ms" },
  { level: "warn", message: "Slow query detected: findUsersByOrg took 312ms" },
  { level: "warn", message: "Rate limit approaching for 192.168.1.42" },
  { level: "warn", message: "Deprecated API endpoint called: /v1/legacy/users" },
  { level: "warn", message: "Memory usage at 78% of allocated heap" },
  { level: "error", message: "ECONNREFUSED: Redis connection failed, retrying..." },
  { level: "error", message: "Unhandled promise rejection in /api/export" },
  { level: "info", message: "Database pool: 14/20 connections active" },
  { level: "info", message: "Cache hit ratio: 94.2% (last 5 min)" },
  { level: "info", message: "GET /api/pipelines 200 18ms" },
  { level: "info", message: "Compiled successfully in 142ms" },
  { level: "info", message: "HMR update applied: components/Dashboard.tsx" },
];

function generateSparklineData(count: number, base: number, variance: number): number[] {
  const data: number[] = [];
  let value = base;
  for (let i = 0; i < count; i++) {
    value += (Math.random() - 0.45) * variance;
    value = Math.max(base * 0.5, Math.min(base * 1.8, value));
    data.push(Math.round(value));
  }
  return data;
}

function generateUptimeData(): number[] {
  return Array.from({ length: 24 }, () => {
    const r = Math.random();
    if (r < 0.05) return 40 + Math.random() * 50;
    if (r < 0.12) return 90 + Math.random() * 8;
    return 99 + Math.random() * 1;
  });
}

// ── Grain Overlay ────────────────────────────────────────────────────────────

function GrainOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "128px 128px",
      }}
    />
  );
}

// ── Conic Gradient Border Card ───────────────────────────────────────────────

function BentoCard({
  children,
  className = "",
  colSpan = 1,
  rowSpan = 1,
  delay = 0,
  glowOnHover = true,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
  rowSpan?: number;
  delay?: number;
  glowOnHover?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const spanClasses = [
    colSpan === 2 ? "md:col-span-2" : "",
    rowSpan === 2 ? "md:row-span-2" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`
        relative group rounded-2xl transition-all duration-700 ease-out
        ${spanClasses}
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}
        ${className}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Conic gradient border */}
      <div
        className="absolute -inset-[1px] rounded-2xl transition-opacity duration-500"
        style={{
          background: hovered && glowOnHover
            ? "conic-gradient(from 180deg, rgba(16,185,129,0.3), rgba(16,185,129,0.05), rgba(255,255,255,0.08), rgba(16,185,129,0.05), rgba(16,185,129,0.3))"
            : "none",
          opacity: hovered ? 1 : 0,
        }}
      />

      {/* Static border */}
      <div className="absolute inset-0 rounded-2xl border border-white/[0.06]" />

      {/* Card body */}
      <div className="relative h-full rounded-2xl backdrop-blur-xl bg-white/[0.03] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Floating Status Pill ─────────────────────────────────────────────────────

function StatusPill({ status }: { status: ServerStatus }) {
  const isRunning = status === "running";
  return (
    <div
      className={`
        fixed top-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full
        border backdrop-blur-md text-xs font-medium transition-all duration-500
        ${
          isRunning
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : "border-zinc-700 bg-zinc-900/80 text-zinc-500"
        }
      `}
    >
      <span
        className={`
          w-2 h-2 rounded-full
          ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}
        `}
      />
      {isRunning ? "Connected" : "Disconnected"}
    </div>
  );
}

// ── Action Button ────────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="
        flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
        bg-white/[0.02] border border-white/[0.04]
        hover:bg-white/[0.06] hover:border-white/[0.1] hover:-translate-y-0.5
        transition-all duration-300 ease-out group/btn
      "
    >
      <div className="text-zinc-500 group-hover/btn:text-emerald-400 transition-colors duration-300">
        {icon}
      </div>
      <span className="text-xs text-zinc-400 group-hover/btn:text-zinc-300 transition-colors">
        {label}
      </span>
    </button>
  );
}

// ── Log Viewer ───────────────────────────────────────────────────────────────

function LogViewer({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolled = useRef(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isUserScrolled.current = scrollHeight - scrollTop - clientHeight > 60;
  }, []);

  useEffect(() => {
    if (scrollRef.current && !isUserScrolled.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs.length]);

  const levelColor: Record<LogEntry["level"], string> = {
    info: "text-zinc-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };

  const levelBadge: Record<LogEntry["level"], string> = {
    info: "text-zinc-600",
    warn: "text-amber-500/70",
    error: "text-red-500/70",
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto font-mono text-[11px] leading-[1.6] px-4 py-3 space-y-px scrollbar-thin"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(63,63,70,0.5) transparent",
      }}
    >
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex gap-3 py-0.5 animate-[fadeSlideIn_0.3s_ease-out]"
        >
          <span className="text-zinc-700 shrink-0 select-none">{log.timestamp}</span>
          <span className={`shrink-0 w-12 uppercase font-semibold tracking-wider ${levelBadge[log.level]}`}>
            {log.level === "info" ? " info" : log.level}
          </span>
          <span className={levelColor[log.level]}>{log.message}</span>
        </div>
      ))}
      {logs.length === 0 && (
        <div className="flex items-center justify-center h-full text-zinc-700 text-xs">
          No log entries yet
        </div>
      )}
    </div>
  );
}

// ── Environment Info Grid ────────────────────────────────────────────────────

function EnvGrid() {
  const items = [
    { label: "Node.js", value: "v22.4.0" },
    { label: "Next.js", value: "v16.0.1" },
    { label: "Env", value: "development" },
    { label: "Turbopack", value: "enabled" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2.5"
        >
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
            {item.label}
          </div>
          <div className="text-xs font-mono text-zinc-300">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DevServerBentoDashboard() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>("running");
  const [uptimeSeconds, setUptimeSeconds] = useState(14832);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requestCount, setRequestCount] = useState(4827);
  const [responseTime, setResponseTime] = useState(24);
  const [activeConnections, setActiveConnections] = useState(12);
  const [bandwidthIn, setBandwidthIn] = useState(2.4);
  const [bandwidthOut, setBandwidthOut] = useState(8.7);
  const logIdRef = useRef(0);

  const [requestSparkline, setRequestSparkline] = useState(() =>
    generateSparklineData(20, 240, 40)
  );
  const [responseSparkline, setResponseSparkline] = useState(() =>
    generateSparklineData(20, 24, 8)
  );
  const [uptimeData] = useState(() => generateUptimeData());

  const animatedRequests = useAnimatedNumber(requestCount);
  const animatedResponseTime = useAnimatedNumber(responseTime);
  const animatedConnections = useAnimatedNumber(activeConnections);
  const animatedUptime = useAnimatedNumber(uptimeSeconds);

  // Uptime counter
  useEffect(() => {
    if (serverStatus !== "running") return;
    const interval = setInterval(() => {
      setUptimeSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [serverStatus]);

  // Log generation
  useEffect(() => {
    if (serverStatus !== "running") return;

    // Add initial batch
    const initialLogs: LogEntry[] = [];
    for (let i = 0; i < 8; i++) {
      const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
      initialLogs.push({
        id: logIdRef.current++,
        timestamp: new Date(Date.now() - (8 - i) * 2000).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        level: template.level,
        message: template.message,
      });
    }
    setLogs(initialLogs);

    const interval = setInterval(() => {
      const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
      const entry: LogEntry = {
        id: logIdRef.current++,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        level: template.level,
        message: template.message,
      };
      setLogs((prev) => [...prev.slice(-200), entry]);
    }, 1800 + Math.random() * 2400);

    return () => clearInterval(interval);
  }, [serverStatus]);

  // Metric updates
  useEffect(() => {
    if (serverStatus !== "running") return;
    const interval = setInterval(() => {
      setRequestCount((c) => c + Math.floor(Math.random() * 12) + 1);
      setResponseTime(Math.round(18 + Math.random() * 20));
      setActiveConnections(Math.round(8 + Math.random() * 12));
      setBandwidthIn(parseFloat((1.5 + Math.random() * 3).toFixed(1)));
      setBandwidthOut(parseFloat((5 + Math.random() * 10).toFixed(1)));
      setRequestSparkline((prev) => [...prev.slice(1), Math.round(180 + Math.random() * 120)]);
      setResponseSparkline((prev) => [...prev.slice(1), Math.round(18 + Math.random() * 20)]);
    }, 3000);
    return () => clearInterval(interval);
  }, [serverStatus]);

  // Format uptime
  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const uptimePercent = (
    uptimeData.reduce((a, b) => a + b, 0) / uptimeData.length
  ).toFixed(2);

  const isRunning = serverStatus === "running";

  const handleStart = () => {
    setServerStatus("running");
    setUptimeSeconds(0);
    setLogs([]);
  };

  const handleStop = () => {
    setServerStatus("stopped");
  };

  const handleRestart = () => {
    setServerStatus("stopped");
    setTimeout(() => {
      setServerStatus("running");
      setUptimeSeconds(0);
      setLogs([]);
    }, 600);
  };

  return (
    <div className="relative h-full w-full bg-zinc-950 text-zinc-100 overflow-y-auto overflow-x-hidden">
      <GrainOverlay />
      <StatusPill status={serverStatus} />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-[-20%] left-[10%] w-[500px] h-[500px] rounded-full transition-opacity duration-1000"
          style={{
            background: isRunning
              ? "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(63,63,70,0.04) 0%, transparent 70%)",
            opacity: 1,
          }}
        />
        <div
          className="absolute bottom-[-10%] right-[5%] w-[400px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(16,185,129,0.03) 0%, transparent 70%)",
            opacity: isRunning ? 1 : 0,
            transition: "opacity 1s",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 lg:p-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
            Dev Server
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Local development environment monitor
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-min">

          {/* ─── Hero Card: Server Status (2-col) ─────────────────────── */}
          <BentoCard colSpan={2} delay={0}>
            <div
              className="relative p-6 h-full min-h-[200px] flex flex-col justify-between overflow-hidden"
            >
              {/* Gradient bg layer */}
              <div
                className="absolute inset-0 transition-all duration-1000"
                style={{
                  background: isRunning
                    ? "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 40%, transparent 70%)"
                    : "linear-gradient(135deg, rgba(63,63,70,0.08) 0%, rgba(63,63,70,0.02) 40%, transparent 70%)",
                }}
              />

              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`
                      w-3 h-3 rounded-full transition-colors duration-500
                      ${isRunning ? "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-zinc-600"}
                    `}
                  />
                  <span className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-medium">
                    Server Status
                  </span>
                </div>

                <div className="flex items-baseline gap-4 mb-1">
                  <span
                    className={`
                      text-4xl font-black tracking-tight transition-colors duration-500
                      ${isRunning ? "text-emerald-400" : "text-zinc-600"}
                    `}
                  >
                    {isRunning ? "RUNNING" : "STOPPED"}
                  </span>
                </div>

                <div className="flex items-center gap-6 mt-3 text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-600">UPTIME</span>
                    <span className="font-mono text-zinc-300 tabular-nums">
                      {formatUptime(animatedUptime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-600">PID</span>
                    <span className="font-mono text-zinc-300">
                      {isRunning ? "48291" : "---"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-600">PORT</span>
                    <span className="font-mono text-zinc-300">
                      {isRunning ? "3000" : "---"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative flex items-center gap-2 mt-5">
                {isRunning ? (
                  <>
                    <button
                      onClick={handleStop}
                      className="
                        px-4 py-2 rounded-lg text-sm font-medium cursor-pointer
                        bg-zinc-800 text-zinc-300 border border-zinc-700
                        hover:bg-zinc-700 hover:text-zinc-100 hover:border-zinc-600
                        transition-all duration-200
                      "
                    >
                      Stop
                    </button>
                    <button
                      onClick={handleRestart}
                      className="
                        px-4 py-2 rounded-lg text-sm font-medium cursor-pointer
                        bg-zinc-800 text-zinc-300 border border-zinc-700
                        hover:bg-zinc-700 hover:text-zinc-100 hover:border-zinc-600
                        transition-all duration-200
                      "
                    >
                      Restart
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStart}
                    className="
                      px-5 py-2 rounded-lg text-sm font-medium cursor-pointer
                      bg-emerald-600 text-white
                      hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]
                      transition-all duration-200
                    "
                  >
                    Start Server
                  </button>
                )}
              </div>
            </div>
          </BentoCard>

          {/* ─── Stats: Request Count ─────────────────────────────────── */}
          <BentoCard delay={80}>
            <div className="p-5 flex flex-col justify-between h-full min-h-[200px]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-3">
                  Total Requests
                </div>
                <div className="text-3xl font-bold text-zinc-100 tabular-nums font-mono">
                  {animatedRequests.toLocaleString()}
                </div>
                <div className="text-xs text-emerald-500/70 mt-1 font-medium">
                  +{Math.floor(Math.random() * 50 + 80)} last 5m
                </div>
              </div>
              <div className="mt-3">
                <Sparkline data={requestSparkline} color="#10b981" width={160} height={36} />
              </div>
            </div>
          </BentoCard>

          {/* ─── Stats: Response Time ─────────────────────────────────── */}
          <BentoCard delay={160}>
            <div className="p-5 flex flex-col justify-between h-full min-h-[200px]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-3">
                  Avg Response Time
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-zinc-100 tabular-nums font-mono">
                    {animatedResponseTime}
                  </span>
                  <span className="text-sm text-zinc-600">ms</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  p99: {Math.round(responseTime * 3.2)}ms
                </div>
              </div>
              <div className="mt-3">
                <Sparkline data={responseSparkline} color="#8b5cf6" width={160} height={36} />
              </div>
            </div>
          </BentoCard>

          {/* ─── Log Viewer (2-col, 2-row) ────────────────────────────── */}
          <BentoCard colSpan={2} rowSpan={2} delay={240}>
            <div className="flex flex-col h-full min-h-[380px]">
              {/* Log header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  </div>
                  <span className="text-xs text-zinc-500 ml-2 font-mono">
                    stdout
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-700 tabular-nums font-mono">
                    {logs.length} lines
                  </span>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Log content */}
              <div className="flex-1 overflow-hidden bg-zinc-950/50">
                <LogViewer logs={logs} />
              </div>
            </div>
          </BentoCard>

          {/* ─── Health: Uptime ────────────────────────────────────────── */}
          <BentoCard delay={320}>
            <div className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-2">
                  Uptime (24h)
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-emerald-400 tabular-nums">
                    {uptimePercent}
                  </span>
                  <span className="text-sm text-zinc-600">%</span>
                </div>
              </div>
              <div className="mt-3">
                <UptimeBarChart data={uptimeData} />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-zinc-700">0h</span>
                  <span className="text-[9px] text-zinc-700">12h</span>
                  <span className="text-[9px] text-zinc-700">24h</span>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* ─── Network Card ─────────────────────────────────────────── */}
          <BentoCard delay={400}>
            <div className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-3">
                  Network
                </div>
                <div className="text-2xl font-bold text-zinc-100 tabular-nums">
                  {animatedConnections}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">active connections</div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-emerald-500">
                      <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    In
                  </span>
                  <span className="font-mono text-zinc-300">{bandwidthIn} MB/s</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-violet-500">
                      <path d="M5 2v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Out
                  </span>
                  <span className="font-mono text-zinc-300">{bandwidthOut} MB/s</span>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* ─── Actions Card ─────────────────────────────────────────── */}
          <BentoCard delay={480}>
            <div className="p-5 h-full">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-3">
                Quick Actions
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  label="Clear Cache"
                  onClick={() => {}}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Browser"
                  onClick={() => {}}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                  }
                />
                <ActionButton
                  label="Copy URL"
                  onClick={() => {}}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                  }
                />
              </div>
            </div>
          </BentoCard>

          {/* ─── Environment Card ──────────────────────────────────────── */}
          <BentoCard delay={560}>
            <div className="p-5 h-full">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-medium mb-3">
                Environment
              </div>
              <EnvGrid />
            </div>
          </BentoCard>
        </div>
      </div>

      {/* Keyframe animation for log entry fade-in */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
