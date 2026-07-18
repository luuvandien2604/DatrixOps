'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { Maximize2, Play, Power, ShieldAlert, TerminalSquare } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface WebTerminalProps {
  serverId: string;
  serverName: string;
  enabled: boolean;
  disabledReason?: string;
}

interface TerminalMessage {
  type: string;
  session_id?: string;
  data?: string;
  reason?: string;
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export default function WebTerminal({ serverId, serverName, enabled, disabledReason }: WebTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [state, setState] = useState<ConnectionState>('idle');
  const [error, setError] = useState('');

  const disposeTerminal = useCallback((notify = true) => {
    const socket = socketRef.current;
    if (socket && notify && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'session_close', reason: 'Operator closed terminal' }));
    }
    socket?.close();
    socketRef.current = null;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    terminalRef.current?.dispose();
    terminalRef.current = null;
    fitAddonRef.current = null;
  }, []);

  const closeTerminal = useCallback((notify = true) => {
    disposeTerminal(notify);
    setState(current => current === 'error' ? current : 'closed');
  }, [disposeTerminal]);

  useEffect(() => () => disposeTerminal(true), [disposeTerminal]);

  const sendResize = useCallback(() => {
    const terminal = terminalRef.current;
    const socket = socketRef.current;
    if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
  }, []);

  const startTerminal = async () => {
    if (!enabled || !containerRef.current || state === 'connecting' || state === 'connected') return;
    disposeTerminal(false);
    containerRef.current.replaceChildren();
    setState('connecting');
    setError('');

    try {
      const styles = getComputedStyle(document.documentElement);
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        convertEol: false,
        fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
        fontSize: 14,
        lineHeight: 1.25,
        scrollback: 5000,
        allowProposedApi: false,
        theme: {
          background: '#050608',
          foreground: styles.getPropertyValue('--paper').trim() || '#f7f7f4',
          cursor: styles.getPropertyValue('--mint').trim() || '#8bd5c5',
          selectionBackground: 'rgba(175,188,255,.28)',
          black: '#050608',
          red: '#ff8da1',
          green: '#8bd5c5',
          yellow: '#f1ca7b',
          blue: '#79c9f4',
          magenta: '#afbcff',
          cyan: '#79c9f4',
          white: '#f7f7f4',
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();
      terminal.writeln(`\x1b[38;2;139;213;197mConnecting to ${serverName}…\x1b[0m`);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const ticket = await apiClient(`/servers/${serverId}/terminal/tickets`, { method: 'POST', data: {} });
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}${ticket.websocket_path}`);
      socketRef.current = socket;

      socket.onopen = () => {
        setState('connected');
        terminal.clear();
        terminal.focus();
        sendResize();
      };
      socket.onmessage = event => {
        let incoming: TerminalMessage;
        try {
          incoming = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (incoming.type === 'output' && incoming.data) {
          terminal.write(base64ToBytes(incoming.data));
        } else if (incoming.type === 'error') {
          terminal.writeln(`\r\n\x1b[31m${incoming.reason || 'Terminal error'}\x1b[0m`);
          setError(incoming.reason || 'Terminal error');
        } else if (incoming.type === 'exit') {
          terminal.writeln(`\r\n\x1b[33m${incoming.reason || 'Shell exited'}\x1b[0m`);
          setState('closed');
        }
      };
      socket.onerror = () => {
        setError('Unable to establish the reverse terminal connection.');
        setState('error');
      };
      socket.onclose = event => {
        if (event.reason) terminal.writeln(`\r\n\x1b[33m${event.reason}\x1b[0m`);
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        socketRef.current = null;
        setState(current => current === 'error' ? current : 'closed');
      };

      terminal.onData(data => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({
          type: 'input',
          data: bytesToBase64(new TextEncoder().encode(data)),
        }));
      });
      const observer = new ResizeObserver(() => {
        fitAddon.fit();
        sendResize();
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;
    } catch (caught: any) {
      setError(caught.message || 'Unable to start terminal');
      setState('error');
      terminalRef.current?.writeln(`\r\n\x1b[31m${caught.message || 'Unable to start terminal'}\x1b[0m`);
      socketRef.current?.close();
      socketRef.current = null;
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[#050608] shadow-2xl shadow-black/30">
      <header className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <TerminalSquare className="h-4 w-4 text-[var(--mint)]" />
            Web Terminal
            <span className={`h-2 w-2 rounded-full ${state === 'connected' ? 'bg-emerald-400' : state === 'connecting' ? 'animate-pulse bg-amber-400' : 'bg-white/30'}`} />
          </div>
          <p className="mt-1 text-xs font-medium text-white/65">
            Agent-native encrypted reverse session · maximum 30 minutes · audited
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state === 'connected' && (
            <button type="button" onClick={() => { fitAddonRef.current?.fit(); sendResize(); terminalRef.current?.focus(); }} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/10">
              <Maximize2 className="h-4 w-4" /> Fit
            </button>
          )}
          {state === 'connected' || state === 'connecting' ? (
            <button type="button" onClick={() => closeTerminal(true)} className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-300">
              <Power className="h-4 w-4" /> Close session
            </button>
          ) : (
            <button type="button" disabled={!enabled} onClick={startTerminal} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">
              <Play className="h-4 w-4" /> Start terminal
            </button>
          )}
        </div>
      </header>

      {!enabled && (
        <div className="flex items-start gap-3 border-b border-amber-400/25 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="font-semibold">{disabledReason || 'Terminal is unavailable for this agent.'}</p>
        </div>
      )}
      {enabled && state === 'idle' && (
        <div className="flex items-start gap-3 border-b border-amber-400/25 bg-amber-400/10 px-5 py-4 text-sm leading-6 text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            This shell runs with the DatrixOps Agent service account&apos;s privileges.
            Start it only when you intend to administer <strong>{serverName}</strong>.
          </p>
        </div>
      )}
      {error && <div className="border-b border-rose-400/20 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-200">{error}</div>}

      <div ref={containerRef} className="h-[34rem] w-full p-3" aria-label={`Terminal session for ${serverName}`} />
    </section>
  );
}
