import {
  Activity,
  AlertTriangle,
  Cable,
  CheckCircle2,
  Printer,
  RefreshCw,
  Terminal,
  Usb,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { appFetch } from '../lib/runtime.ts';
import type { EquipmentItem, RemoteSessionRecord } from '../types/domain.ts';

interface RemoteConsoleModalProps {
  equipment: EquipmentItem | null;
  onClose: () => void;
  onStatusUpdated: () => void;
}

interface ProbeResult {
  port: number;
  service: string;
  reachable: boolean;
  latencyMs: number | null;
  errorCode: string | null;
  message: string;
}

interface DiagnoseResponse {
  equipmentId: number;
  connectionInterface: string;
  networkAddress: string | null;
  connectionStatus: string;
  probes: ProbeResult[];
  issuesFound: string[];
  activeIncidents: {
    id: number;
    ticketCode: string;
    title: string;
    priority: string;
    status: string;
  }[];
  inspectionOverdue: boolean;
  contractExpired: boolean;
  sessions: RemoteSessionRecord[];
}

interface WebUsbNavigator extends Navigator {
  usb?: {
    requestDevice: (options: {
      filters: { classCode?: number }[];
    }) => Promise<{
      productName?: string;
      manufacturerName?: string;
      vendorId: number;
      productId: number;
      opened: boolean;
      open: () => Promise<void>;
      close: () => Promise<void>;
    }>;
  };
}

export function RemoteConsoleModal({
  equipment,
  onClose,
  onStatusUpdated,
}: RemoteConsoleModalProps) {
  const { idToken } = useAuth();

  const [diagnosing, setDiagnosing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagnoseResponse | null>(null);
  const [sessions, setSessions] = useState<RemoteSessionRecord[]>([]);
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [testPdfUrl, setTestPdfUrl] = useState<string | null>(null);
  const [usbStatus, setUsbStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadSessions = useCallback(async () => {
    if (!equipment || !idToken) return;
    try {
      const rows = await apiFetch<RemoteSessionRecord[]>(
        `/api/equipments/${equipment.id}/remote-sessions`,
        idToken
      );
      setSessions(rows);
    } catch {
      // Ignore
    }
  }, [equipment, idToken]);

  useEffect(() => {
    let generatedUrl: string | null = null;
    setDiagResult(null);
    setPrintMessage(null);
    setUsbStatus(null);
    setError(null);
    setTestPdfUrl(null);

    if (equipment && idToken) {
      loadSessions();
    }

    return () => {
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [equipment, idToken, loadSessions]);

  useEffect(() => {
    return () => {
      if (testPdfUrl) URL.revokeObjectURL(testPdfUrl);
    };
  }, [testPdfUrl]);

  if (!equipment) return null;

  const handleRunDiagnose = async () => {
    if (!idToken || diagnosing) return;
    setDiagnosing(true);
    setError(null);
    try {
      const res = await apiFetch<DiagnoseResponse>(
        `/api/equipments/${equipment.id}/remote-diagnose`,
        idToken,
        { method: 'POST' }
      );
      setDiagResult(res);
      setSessions(res.sessions);
      onStatusUpdated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao executar diagnóstico.'
      );
    } finally {
      setDiagnosing(false);
    }
  };

  const handlePrintTestPage = async () => {
    if (!idToken || printing) return;
    setPrinting(true);
    setError(null);
    setPrintMessage(null);

    try {
      const res = await apiFetch<{
        rawSent: boolean;
        message: string;
        sessions: RemoteSessionRecord[];
      }>(`/api/equipments/${equipment.id}/print-test-page`, idToken, {
        method: 'POST',
      });
      setPrintMessage(res.message);
      setSessions(res.sessions);

      // Also fetch formatted Test Page PDF for browser/USB local print
      const pdfRes = await appFetch(`/api/equipments/${equipment.id}/test-page-pdf`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (pdfRes.ok) {
        const blob = await pdfRes.blob();
        if (testPdfUrl) URL.revokeObjectURL(testPdfUrl);
        setTestPdfUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao disparar página de teste.'
      );
    } finally {
      setPrinting(false);
    }
  };

  const handleCheckWebUsb = async () => {
    const nav = navigator as WebUsbNavigator;
    if (!nav.usb) {
      setUsbStatus(
        'API WebUSB não disponível neste navegador (utilize Chrome/Edge desktop para inspecionar dispositivos USB locais ou use o PDF de teste abaixo).'
      );
      return;
    }

    try {
      const device = await nav.usb.requestDevice({
        filters: [{ classCode: 7 }, {}], // Printer class 7 or general USB device
      });
      await device.open();
      setUsbStatus(
        `Dispositivo USB conectado e verificado: ${device.manufacturerName || 'Fabricante'} ${device.productName || 'Impressora USB'} (VID:${device.vendorId.toString(16)} PID:${device.productId.toString(16)}). Pronto para impressão local.`
      );
      await device.close();
    } catch (err) {
      setUsbStatus(
        err instanceof Error
          ? `Seleção USB cancelada ou indisponível: ${err.message}`
          : 'Nenhum dispositivo USB selecionado.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Terminal className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                Conexão Remota e Diagnóstico · {equipment.assetTag}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {equipment.brand} {equipment.model} · Setor {equipment.departmentCode} ({equipment.departmentName})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar console remoto"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Connection Context Strip */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                {equipment.connectionInterface === 'USB Local' ? (
                  <Usb className="w-4 h-4 text-blue-600" />
                ) : (
                  <Cable className="w-4 h-4 text-blue-600" />
                )}
                <span>Interface: {equipment.connectionInterface}</span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-mono">
                  {equipment.networkAddress || 'Sem endereço cadastrado'}
                  {equipment.portNumber ? `:${equipment.portNumber}` : ''}
                </span>
              </div>
              <p className="text-slate-600">
                Estado da Conexão:{' '}
                <strong className="text-slate-900">
                  {diagResult?.connectionStatus || equipment.connectionStatus}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunDiagnose}
                disabled={diagnosing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>
                  {diagnosing
                    ? 'Verificando...'
                    : 'Verificar Problemas (Máquina / Impressora)'}
                </span>
              </button>

              <button
                type="button"
                onClick={handlePrintTestPage}
                disabled={printing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  {printing ? 'Enviando...' : 'Imprimir Página de Teste'}
                </span>
              </button>

              {equipment.connectionInterface === 'USB Local' && (
                <button
                  type="button"
                  onClick={handleCheckWebUsb}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Usb className="w-3.5 h-3.5" />
                  <span>Detectar Porta USB (WebUSB)</span>
                </button>
              )}
            </div>
          </div>

          {usbStatus && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
              {usbStatus}
            </div>
          )}

          {printMessage && (
            <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 flex items-center justify-between gap-3">
              <span>{printMessage}</span>
              {testPdfUrl && (
                <button
                  type="button"
                  onClick={() => iframeRef.current?.contentWindow?.print()}
                  className="px-3 py-1 bg-slate-900 text-white rounded-md font-medium whitespace-nowrap cursor-pointer"
                >
                  Imprimir via Spooler / USB Local
                </button>
              )}
            </div>
          )}

          {/* Diagnostics Results */}
          {diagResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-900">
                  Verificação de Portas e Conectividade ({diagResult.connectionInterface})
                </h3>
                {diagResult.probes.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhuma sonda TCP aplicável para esta interface.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {diagResult.probes.map((probe) => (
                      <div
                        key={probe.port}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {probe.reachable ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              Porta {probe.port} · {probe.service}
                            </p>
                            <p className="text-[11px] text-slate-600 truncate">
                              {probe.message}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                          {probe.latencyMs !== null ? `${probe.latencyMs}ms` : probe.errorCode || 'OFF'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-900">
                  Problemas e Alertas Identificados
                </h3>
                {diagResult.issuesFound.length === 0 ? (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Nenhum problema operacional ou de conectividade detectado.</span>
                  </div>
                ) : (
                  <ul className="space-y-2 text-xs text-amber-900">
                    {diagResult.issuesFound.map((issue, idx) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {diagResult.activeIncidents.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">
                      Chamados Abertos Vinculados:
                    </p>
                    {diagResult.activeIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="text-xs text-slate-700 flex items-center justify-between"
                      >
                        <span className="truncate">
                          <strong className="font-mono">{inc.ticketCode}</strong> · {inc.title}
                        </span>
                        <span className="text-[11px] text-red-700 font-medium shrink-0">
                          {inc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inline Printable Test Page PDF */}
          {testPdfUrl && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  Pré-visualização da Página de Teste (Pronta para Spooler / USB)
                </span>
                <button
                  type="button"
                  onClick={() => iframeRef.current?.contentWindow?.print()}
                  className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                >
                  Abrir Diálogo de Impressão
                </button>
              </div>
              <iframe
                ref={iframeRef}
                src={testPdfUrl}
                title="Página de Teste de Impressão"
                className="w-full h-72 bg-white"
              />
            </div>
          )}

          {/* Remote Sessions Audit Log */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Histórico de Ações Remotas e Impressões de Teste
              </h3>
              <button
                type="button"
                onClick={loadSessions}
                className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Atualizar</span>
              </button>
            </div>
            {sessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhuma verificação remota ou impressão de teste registrada para este ativo ainda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="px-4 py-3 text-xs flex items-start justify-between gap-4"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-slate-900">
                        {s.actionType === 'IMPRESSAO_TESTE'
                          ? 'Impressão de Teste'
                          : 'Diagnóstico Remoto'}{' '}
                        ·{' '}
                        <span
                          className={
                            s.resultStatus === 'Sucesso'
                              ? 'text-emerald-700'
                              : s.resultStatus === 'Alerta'
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }
                        >
                          {s.resultStatus}
                        </span>
                      </p>
                      <p className="text-slate-600">{s.details}</p>
                      <p className="text-[11px] text-slate-400">
                        Técnico: {s.technicianName || 'TI'} · {s.connectionInterface}
                        {s.latencyMs !== null ? ` · ${s.latencyMs}ms` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(s.createdAt))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
