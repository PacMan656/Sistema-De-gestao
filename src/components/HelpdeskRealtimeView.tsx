import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  CheckCircle2,
  Hash,
  MessageSquare,
  Plus,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext.tsx';
import { useSocket } from '../context/SocketContext.tsx';
import { apiFetch } from '../lib/api.ts';
import {
  createIncidentSchema,
  INCIDENT_PRIORITIES,
  type CreateIncidentInput,
} from '../shared/validation.ts';
import type { ChatMessageItem, IncidentItem } from '../types/domain.ts';
import { IncidentStatusLabel, PriorityLabel } from './StatusText.tsx';

interface SectorAssetOption {
  id: number;
  assetTag: string;
  brand: string;
  model: string;
  departmentCode: string | null;
}

export function HelpdeskRealtimeView() {
  const { appUser, departments, idToken } = useAuth();
  const {
    connected,
    onlineUsers,
    joinDepartmentRoom,
    sendChatMessage,
    createIncidentRealtime,
    updateIncidentStatusRealtime,
    subscribeMessages,
    subscribeIncidents,
  } = useSocket();

  const isAdmin = appUser?.role === 'admin_ti';
  const [selectedDeptId, setSelectedDeptId] = useState<number>(
    appUser?.departmentId || departments[0]?.id || 1
  );
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [sectorAssets, setSectorAssets] = useState<SectorAssetOption[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const feedBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!idToken) return;
    apiFetch<SectorAssetOption[]>('/api/incidents/sector-assets', idToken)
      .then((rows) => setSectorAssets(rows))
      .catch(() => {
        // Optional lookup; ignore errors
      });
  }, [idToken]);

  useEffect(() => {
    if (appUser?.departmentId && !isAdmin) {
      setSelectedDeptId(appUser.departmentId);
    }
  }, [appUser?.departmentId, isAdmin]);

  const loadChannelData = useCallback(async () => {
    if (!idToken || !selectedDeptId) return;
    setLoadingFeed(true);
    try {
      const [chatRes, incRes] = await Promise.all([
        apiFetch<ChatMessageItem[]>(`/api/chat/${selectedDeptId}`, idToken),
        apiFetch<IncidentItem[]>(
          isAdmin ? '/api/incidents' : `/api/incidents?departmentId=${selectedDeptId}`,
          idToken
        ),
      ]);
      setMessages(chatRes);
      setIncidents(incRes);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao carregar canal.'
      );
    } finally {
      setLoadingFeed(false);
    }
  }, [idToken, selectedDeptId, isAdmin]);

  useEffect(() => {
    loadChannelData();
    if (selectedDeptId) {
      joinDepartmentRoom(selectedDeptId);
    }
  }, [loadChannelData, selectedDeptId, joinDepartmentRoom]);

  useEffect(() => {
    const unsubMsg = subscribeMessages((msg) => {
      if (msg.departmentId === selectedDeptId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    const unsubInc = subscribeIncidents((inc) => {
      setIncidents((prev) => {
        const exists = prev.some((item) => item.id === inc.id);
        if (exists) {
          return prev.map((item) => (item.id === inc.id ? inc : item));
        }
        if (isAdmin || inc.departmentId === selectedDeptId) {
          return [inc, ...prev];
        }
        return prev;
      });
    });

    return () => {
      unsubMsg();
      unsubInc();
    };
  }, [selectedDeptId, isAdmin, subscribeMessages, subscribeIncidents]);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content || sendingChat) return;

    setSendingChat(true);
    setActionError(null);
    try {
      await sendChatMessage({
        departmentId: selectedDeptId,
        content,
      });
      setChatInput('');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Falha ao enviar mensagem.'
      );
    } finally {
      setSendingChat(false);
    }
  };

  const handleStatusChange = async (
    incidentId: number,
    nextStatus: 'Aberto' | 'Em Atendimento' | 'Resolvido'
  ) => {
    setActionError(null);
    try {
      await updateIncidentStatusRealtime(incidentId, nextStatus);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar status.'
      );
    }
  };

  const selectedDept = departments.find((d) => d.id === selectedDeptId);
  const visibleIncidents = incidents.filter((inc) => {
    const matchesStatus = statusFilter === 'Todos' || inc.status === statusFilter;
    const matchesDept = isAdmin ? true : inc.departmentId === selectedDeptId;
    return matchesStatus && matchesDept;
  });

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="underline cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-h-[620px]">
        {/* Left: Department Channels & Presence */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">
                Canais por Setor
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{connected ? 'Socket Ativo' : 'Reconectando'}</span>
              </span>
            </div>

            <div className="mt-3 space-y-1">
              {departments
                .filter((d) => isAdmin || d.id === appUser?.departmentId)
                .map((dept) => {
                  const active = dept.id === selectedDeptId;
                  const openCount = incidents.filter(
                    (i) => i.departmentId === dept.id && i.status !== 'Resolvido'
                  ).length;

                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => setSelectedDeptId(dept.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white font-medium'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <Hash className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate">
                          {dept.code} · {dept.name}
                        </span>
                      </span>
                      {openCount > 0 && (
                        <span
                          className={`font-mono tabular-nums text-[11px] shrink-0 ${
                            active ? 'text-amber-300' : 'text-red-600 font-semibold'
                          }`}
                        >
                          {openCount}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Conectados Agora ({onlineUsers.length})</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {onlineUsers.map((u, idx) => (
                <div
                  key={`${u.id}-${idx}`}
                  className="text-xs text-slate-600 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{u.fullName}</span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {u.role === 'admin_ti' ? 'TI' : u.departmentCode || 'SETOR'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Real-time Community Feed / Chat */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {selectedDept
                  ? `${selectedDept.code} · ${selectedDept.name}`
                  : 'Canal Departamental'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {selectedDept?.location || 'Comunicação bidirecional em tempo real'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIncidentModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Reportar Incidente</span>
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/60 max-h-[470px]">
            {loadingFeed ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                Sincronizando histórico do canal...
              </div>
            ) : messages.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <MessageSquare className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">
                  Nenhuma mensagem neste canal ainda. Inicie uma conversa ou reporte um incidente de TI.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.senderId === appUser?.id;
                const timeStr = new Intl.DateTimeFormat('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(msg.createdAt));

                if (msg.messageType === 'INCIDENT_ALERT') {
                  return (
                    <div
                      key={msg.id}
                      className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-red-800 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Alerta de Incidente · {msg.senderName}</span>
                        </span>
                        <span className="font-mono tabular-nums text-[11px]">
                          {timeStr}
                        </span>
                      </div>
                      <p className="text-red-900 leading-relaxed">{msg.content}</p>
                    </div>
                  );
                }

                if (msg.messageType === 'STATUS_CHANGE') {
                  return (
                    <div
                      key={msg.id}
                      className="py-1.5 px-3 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{msg.content}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                        {timeStr}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                      <span className="font-medium text-slate-700">
                        {msg.senderName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {msg.senderRole === 'admin_ti' ? 'Técnico TI' : msg.departmentCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{timeStr}</span>
                    </div>
                    <div
                      className={`max-w-[88%] px-3.5 py-2 rounded-lg text-xs leading-relaxed ${
                        isMine
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={feedBottomRef} />
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Enviar mensagem em #${selectedDept?.code || 'SETOR'}...`}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || sendingChat}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar</span>
            </button>
          </form>
        </div>

        {/* Right: Incident Triage Queue */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                {isAdmin ? 'Fila Global de Triagem TI' : 'Chamados do Setor'}
              </h2>
              <span className="font-mono tabular-nums text-xs text-slate-500">
                {visibleIncidents.length}
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {['Todos', 'Aberto', 'Em Atendimento', 'Resolvido'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[520px]">
            {visibleIncidents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhum incidente neste filtro.
              </div>
            ) : (
              visibleIncidents.map((inc) => (
                <div key={inc.id} className="p-4 space-y-2 hover:bg-slate-50/70">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      <span className="font-semibold text-slate-900">
                        {inc.ticketCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{inc.departmentCode}</span>
                    </div>
                    <IncidentStatusLabel status={inc.status} />
                  </div>

                  <p className="text-sm font-semibold text-slate-900 leading-snug">
                    {inc.title}
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {inc.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span>Solicitante: {inc.requesterName}</span>
                    <span aria-hidden="true">·</span>
                    <PriorityLabel priority={inc.priority} />
                    {inc.equipmentAssetTag && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-700">
                          {inc.equipmentAssetTag}
                        </span>
                      </>
                    )}
                  </div>

                  {isAdmin && inc.status !== 'Resolvido' && (
                    <div className="pt-1.5 flex items-center gap-2">
                      {inc.status === 'Aberto' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(inc.id, 'Em Atendimento')
                          }
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-md cursor-pointer"
                        >
                          Assumir Atendimento
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(inc.id, 'Resolvido')}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-md cursor-pointer"
                      >
                        Marcar Resolvido
                      </button>
                      {inc.departmentId !== selectedDeptId && (
                        <button
                          type="button"
                          onClick={() => setSelectedDeptId(inc.departmentId)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                        >
                          Abrir Chat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* New Incident Modal */}
      <ReportIncidentModal
        open={showIncidentModal}
        defaultDepartmentId={selectedDeptId}
        equipments={sectorAssets}
        isAdmin={isAdmin}
        onClose={() => setShowIncidentModal(false)}
        onSubmitIncident={async (payload) => {
          await createIncidentRealtime(payload);
        }}
      />
    </div>
  );
}

interface ReportIncidentModalProps {
  open: boolean;
  defaultDepartmentId: number;
  equipments: SectorAssetOption[];
  isAdmin: boolean;
  onClose: () => void;
  onSubmitIncident: (payload: CreateIncidentInput) => Promise<void>;
}

function ReportIncidentModal({
  open,
  defaultDepartmentId,
  equipments,
  isAdmin,
  onClose,
  onSubmitIncident,
}: ReportIncidentModalProps) {
  const { departments } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateIncidentInput>({
    resolver: zodResolver(createIncidentSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'Média',
      departmentId: defaultDepartmentId,
      equipmentId: null,
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      reset({
        title: '',
        description: '',
        priority: 'Alta',
        departmentId: defaultDepartmentId,
        equipmentId: null,
      });
    }
  }, [open, defaultDepartmentId, reset]);

  if (!open) return null;

  const onSubmit = async (data: CreateIncidentInput) => {
    setServerError(null);
    try {
      await onSubmitIncident({
        ...data,
        equipmentId: data.equipmentId ? Number(data.equipmentId) : null,
      });
      onClose();
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Erro ao abrir incidente.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Reportar Incidente de TI em Tempo Real
            </h2>
            <p className="text-xs text-slate-500">
              Envia notificação instantânea via WebSocket para a equipe de TI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {serverError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Título do Problema *
            </label>
            <input
              {...register('title')}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              placeholder="Ex: Impressora do setor travada / Sem acesso à rede"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Prioridade *
              </label>
              <select
                {...register('priority')}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              >
                {INCIDENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Setor de Origem *
                </label>
                <select
                  {...register('departmentId', { valueAsNumber: true })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Equipamento / Patrimônio Relacionado (Opcional)
            </label>
            <select
              {...register('equipmentId', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
            >
              <option value="">Sem patrimônio específico (Rede / Sistema / Geral)</option>
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.assetTag} · {eq.brand} {eq.model} ({eq.departmentCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Descrição Detalhada *
            </label>
            <textarea
              rows={3}
              {...register('description')}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              placeholder="Descreva sintomas, mensagens de erro ou estação afetada..."
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              {isSubmitting ? 'Notificando TI...' : 'Enviar Chamado Urgente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
