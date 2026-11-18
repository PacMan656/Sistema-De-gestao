import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { CreateIncidentInput } from '../shared/validation.ts';
import type {
  ChatMessageItem,
  IncidentItem,
  PresenceUser,
} from '../types/domain.ts';
import { useAuth } from './AuthContext.tsx';
import { isLocalMode, isFirebaseMode } from '../lib/runtime.ts';
import { createFirebaseSocket } from '../firebase/socket.ts';
import { createLocalSocket } from '../browser/socket.ts';

interface SocketContextValue {
  connected: boolean;
  onlineUsers: PresenceUser[];
  liveAlerts: IncidentItem[];
  dismissAlert: (incidentId: number) => void;
  joinDepartmentRoom: (departmentId: number) => void;
  sendChatMessage: (payload: {
    departmentId: number;
    content: string;
    incidentId?: number | null;
  }) => Promise<void>;
  createIncidentRealtime: (payload: CreateIncidentInput) => Promise<IncidentItem>;
  updateIncidentStatusRealtime: (
    incidentId: number,
    status: 'Aberto' | 'Em Atendimento' | 'Resolvido'
  ) => Promise<IncidentItem>;
  subscribeMessages: (cb: (msg: ChatMessageItem) => void) => () => void;
  subscribeIncidents: (cb: (inc: IncidentItem) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function playAlertTone() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(587.33, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // Browser autoplay policy may block audio before user gesture
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { appUser, rbacToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<IncidentItem[]>([]);

  const messageListenersRef = useRef<Set<(msg: ChatMessageItem) => void>>(new Set());
  const incidentListenersRef = useRef<Set<(inc: IncidentItem) => void>>(new Set());

  useEffect(() => {
    if (!appUser || !appUser.onboardingCompleted || !rbacToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    const socket = isFirebaseMode ? createFirebaseSocket(appUser) : isLocalMode ? createLocalSocket(rbacToken, appUser) : io({
      path: '/socket.io',
      auth: {
        token: rbacToken,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('presence:update', (users: PresenceUser[]) => {
      setOnlineUsers(users);
    });

    socket.on('chat:message', (msg: ChatMessageItem) => {
      messageListenersRef.current.forEach((cb) => cb(msg));
    });

    socket.on('incident:notify_ti', (inc: IncidentItem) => {
      incidentListenersRef.current.forEach((cb) => cb(inc));
      if (appUser.role === 'admin_ti') {
        playAlertTone();
        setLiveAlerts((prev) => {
          if (prev.some((a) => a.id === inc.id)) return prev;
          return [inc, ...prev].slice(0, 5);
        });
      }
    });

    socket.on('incident:status_update', (inc: IncidentItem) => {
      incidentListenersRef.current.forEach((cb) => cb(inc));
      setLiveAlerts((prev) =>
        prev.map((a) => (a.id === inc.id ? inc : a)).filter((a) => a.status !== 'Resolvido')
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [appUser, rbacToken]);

  const dismissAlert = useCallback((incidentId: number) => {
    setLiveAlerts((prev) => prev.filter((a) => a.id !== incidentId));
  }, []);

  const joinDepartmentRoom = useCallback((departmentId: number) => {
    socketRef.current?.emit('room:join', { departmentId });
  }, []);

  const sendChatMessage = useCallback(
    (payload: { departmentId: number; content: string; incidentId?: number | null }) => {
      return new Promise<void>((resolve, reject) => {
        if (!socketRef.current) {
          reject(new Error('WebSocket desconectado.'));
          return;
        }
        socketRef.current.emit(
          'chat:message',
          payload,
          (ack: { ok: boolean; error?: string }) => {
            if (ack?.ok) resolve();
            else reject(new Error(ack?.error || 'Erro ao enviar mensagem.'));
          }
        );
      });
    },
    []
  );

  const createIncidentRealtime = useCallback((payload: CreateIncidentInput) => {
    return new Promise<IncidentItem>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('WebSocket desconectado.'));
        return;
      }
      socketRef.current.emit(
        'incident:create',
        payload,
        (ack: { ok: boolean; incident?: IncidentItem; error?: string }) => {
          if (ack?.ok && ack.incident) resolve(ack.incident);
          else reject(new Error(ack?.error || 'Erro ao abrir incidente.'));
        }
      );
    });
  }, []);

  const updateIncidentStatusRealtime = useCallback(
    (incidentId: number, status: 'Aberto' | 'Em Atendimento' | 'Resolvido') => {
      return new Promise<IncidentItem>((resolve, reject) => {
        if (!socketRef.current) {
          reject(new Error('WebSocket desconectado.'));
          return;
        }
        socketRef.current.emit(
          'incident:status_update',
          { incidentId, status },
          (ack: { ok: boolean; incident?: IncidentItem; error?: string }) => {
            if (ack?.ok && ack.incident) resolve(ack.incident);
            else reject(new Error(ack?.error || 'Erro ao atualizar chamado.'));
          }
        );
      });
    },
    []
  );

  const subscribeMessages = useCallback((cb: (msg: ChatMessageItem) => void) => {
    messageListenersRef.current.add(cb);
    return () => {
      messageListenersRef.current.delete(cb);
    };
  }, []);

  const subscribeIncidents = useCallback((cb: (inc: IncidentItem) => void) => {
    incidentListenersRef.current.add(cb);
    return () => {
      incidentListenersRef.current.delete(cb);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        connected,
        onlineUsers,
        liveAlerts,
        dismissAlert,
        joinDepartmentRoom,
        sendChatMessage,
        createIncidentRealtime,
        updateIncidentStatusRealtime,
        subscribeMessages,
        subscribeIncidents,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket deve ser utilizado dentro de SocketProvider.');
  return ctx;
}
