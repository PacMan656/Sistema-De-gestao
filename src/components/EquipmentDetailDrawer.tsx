import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Pencil,
  Printer,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type {
  EquipmentItem,
  InspectionRecord,
  MovementRecord,
} from '../types/domain.ts';
import { Code128Svg } from './Code128Svg.tsx';
import { OperationalStatusLabel } from './StatusText.tsx';

interface EquipmentDetailDrawerProps {
  equipmentId: number | null;
  onClose: () => void;
  onEdit: (equipment: EquipmentItem) => void;
  onCheckout: (equipment: EquipmentItem) => void;
  onCheckin: (equipment: EquipmentItem) => void;
  onOpenPdf: (movementId: number, termLabel: string) => void;
  onOpenRemoteConsole: (equipment: EquipmentItem) => void;
  onOpenBarcodeLabel: (equipment: EquipmentItem) => void;
}

export function EquipmentDetailDrawer({
  equipmentId,
  onClose,
  onEdit,
  onCheckout,
  onCheckin,
  onOpenPdf,
  onOpenRemoteConsole,
  onOpenBarcodeLabel,
}: EquipmentDetailDrawerProps) {
  const { idToken, appUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    equipment: EquipmentItem;
    movements: MovementRecord[];
    inspections: InspectionRecord[];
    linkedEquipments: EquipmentItem[];
    parentEquipment: EquipmentItem | null;
  } | null>(null);

  useEffect(() => {
    if (!equipmentId || !idToken) {
      setDetail(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    apiFetch<{
      equipment: EquipmentItem;
      movements: MovementRecord[];
      inspections: InspectionRecord[];
      linkedEquipments: EquipmentItem[];
      parentEquipment: EquipmentItem | null;
    }>(`/api/equipments/${equipmentId}`, idToken)
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [equipmentId, idToken]);

  if (!equipmentId) return null;

  const isAdmin = appUser?.role === 'admin_ti';

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35 flex justify-end">
      <div role="dialog" aria-modal="true" aria-label="Detalhes do equipamento" className="bg-white border-l border-slate-200 w-full max-w-2xl h-full flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-500">
              {detail?.equipment.assetTag || `Ativo #${equipmentId}`}
            </p>
            <h2 className="text-lg font-bold text-slate-900 truncate">
              {detail
                ? `${detail.equipment.brand} ${detail.equipment.model}`
                : 'Carregando ativo...'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && detail && (
              <button
                type="button"
                onClick={() => onEdit(detail.equipment)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="space-y-3">
              <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {detail && !loading && (
            <>
              {(detail.parentEquipment || detail.linkedEquipments.length > 0) && <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <h3 className="font-bold text-sm text-blue-900">Vínculos do equipamento</h3>
                {detail.parentEquipment && <p className="text-sm text-blue-900">Computador principal: <strong>{detail.parentEquipment.assetTag}</strong> — {detail.parentEquipment.brand} {detail.parentEquipment.model}</p>}
                {detail.linkedEquipments.length > 0 && <ul className="space-y-2">{detail.linkedEquipments.map((item) => <li key={item.id} className="text-sm text-blue-900 break-words"><strong>{item.assetTag}</strong> — {item.equipmentType} · {item.brand} {item.model}</li>)}</ul>}
              </section>}
              {/* Quick Actions */}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2.5 pb-4 border-b border-slate-100">
                  {detail.equipment.operationalStatus === 'Disponível' && (
                    <button
                      type="button"
                      onClick={() => onCheckout(detail.equipment)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Registrar Saída e Termo PDF</span>
                    </button>
                  )}
                  {(detail.equipment.operationalStatus === 'Em Uso' ||
                    detail.equipment.operationalStatus === 'Em Manutenção') && (
                    <button
                      type="button"
                      onClick={() => onCheckin(detail.equipment)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Registrar Devolução / Vistoria</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenRemoteConsole(detail.equipment)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                  >
                    <Terminal className="w-4 h-4 text-blue-600" />
                    <span>Conexão Remota / Teste</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenBarcodeLabel(detail.equipment)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-700" />
                    <span>Imprimir Etiqueta</span>
                  </button>
                </div>
              )}

              {/* Dual Barcode Strip */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <Code128Svg
                    value={detail.equipment.assetTag}
                    label="Patrimônio (Code 128)"
                    height={36}
                  />
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <Code128Svg
                    value={detail.equipment.serialNumber}
                    label="Número de Série (Code 128)"
                    height={36}
                  />
                </div>
              </div>

              {/* Technical Specs */}
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4 text-sm break-words">
                <div>
                  <p className="text-xs text-slate-500">Status Operacional</p>
                  <div className="mt-1">
                    <OperationalStatusLabel
                      status={detail.equipment.operationalStatus}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Número de Série</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-900">
                    {detail.equipment.serialNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tipo / Ano</p>
                  <p className="mt-0.5 text-slate-900 tabular-nums">
                    {detail.equipment.equipmentType} · {detail.equipment.manufactureYear}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Setor Atual</p>
                  <p className="mt-0.5 text-slate-900">
                    {detail.equipment.departmentCode} · {detail.equipment.departmentName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Propriedade</p>
                  <p className="mt-0.5 text-slate-900">
                    {detail.equipment.ownershipType}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Empresa Responsável</p>
                  <p className="mt-0.5 text-slate-900">
                    {detail.equipment.responsibleCompany}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Interface de Conexão</p>
                  <p className="mt-0.5 text-slate-900">
                    {detail.equipment.connectionInterface || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Endereço / Porta USB</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-900">
                    {detail.equipment.networkAddress || '—'}
                    {detail.equipment.portNumber ? `:${detail.equipment.portNumber}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Estado da Conexão</p>
                  <p className="mt-0.5 text-slate-900">
                    {detail.equipment.connectionStatus || 'Não Verificado'}
                  </p>
                </div>
                {detail.equipment.ownershipType !== 'Próprio' && (
                  <>
                    <div>
                      <p className="text-xs text-slate-500">Contrato</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-900">
                        {detail.equipment.contractNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Fornecedor</p>
                      <p className="mt-0.5 text-slate-900">
                        {detail.equipment.supplierName || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Vigência</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-900">
                        {detail.equipment.contractEndDate || '—'}
                      </p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs text-slate-500">Portador Atual</p>
                  <p className="mt-0.5 text-slate-900">
                    {detail.equipment.currentHolderName
                      ? `${detail.equipment.currentHolderName} (${detail.equipment.currentHolderDocument})`
                      : 'Em estoque'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Última Vistoria</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-900">
                    {detail.equipment.lastInspectionDate || 'Não registrada'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Próxima Vistoria</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-900">
                    {detail.equipment.nextInspectionDate || 'A definir'}
                  </p>
                </div>
              </div>

              {(detail.equipment.accessories || detail.equipment.notes) && (
                <div className="pt-4 border-t border-slate-100 space-y-2 text-sm">
                  {detail.equipment.accessories && (
                    <div>
                      <span className="text-xs text-slate-500">Acessórios: </span>
                      <span className="text-slate-800">
                        {detail.equipment.accessories}
                      </span>
                    </div>
                  )}
                  {detail.equipment.notes && (
                    <div>
                      <span className="text-xs text-slate-500">Observações: </span>
                      <span className="text-slate-800">{detail.equipment.notes}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Immutable Movement Timeline */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  Timeline Imutável de Movimentações ({detail.movements.length})
                </h3>
                {detail.movements.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhuma entrada ou saída registrada para este patrimônio até o momento.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {detail.movements.map((mov) => (
                      <div key={mov.id} className="p-4 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-semibold text-slate-900">
                            <span>
                              {mov.movementType === 'SAIDA'
                                ? 'Saída / Alocação'
                                : 'Entrada / Devolução'}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="text-slate-600 font-normal">
                              {mov.previousStatus} → {mov.newStatus}
                            </span>
                          </div>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {new Intl.DateTimeFormat('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(mov.occurredAt))}
                          </span>
                        </div>

                        <p className="text-slate-700">
                          Colaborador: <strong>{mov.collaboratorName}</strong> (
                          {mov.collaboratorDocument}) · {mov.collaboratorRole} ·{' '}
                          {mov.collaboratorDepartment}
                        </p>
                        <p className="text-slate-600">
                          Motivo: {mov.reason} · Estado: {mov.conditionState} · Técnico:{' '}
                          {mov.performedByName || 'TI'}
                        </p>

                        {mov.movementType === 'SAIDA' && (
                          <div className="pt-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenPdf(
                                  mov.id,
                                  mov.termNumber || `TRM-${mov.id}`
                                )
                              }
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>
                                Visualizar Termo PDF ({mov.termNumber || `#${mov.id}`})
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inspections History */}
              <div className="pt-2">
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  Vistorias Técnicas Registradas ({detail.inspections.length})
                </h3>
                {detail.inspections.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhuma vistoria de recebimento registrada ainda.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {detail.inspections.map((insp) => (
                      <div key={insp.id} className="p-4 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Vistoria {insp.inspectionDate} · {insp.physicalCondition}
                          </span>
                          <span className="text-slate-500">
                            Inspetor: {insp.inspectorName || 'TI'}
                          </span>
                        </div>
                        <p className="text-slate-600">
                          Resultado:{' '}
                          {insp.approvedForUse
                            ? 'Aprovado para uso'
                            : 'Encaminhado para manutenção'}
                          {insp.findings ? ` · ${insp.findings}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
