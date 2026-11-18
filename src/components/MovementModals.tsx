import { zodResolver } from '@hookform/resolvers/zod';
import { Download, FileText, Printer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch, fetchAuthorizedPdfBlobUrl } from '../lib/api.ts';
import {
  checkinMovementSchema,
  checkoutMovementSchema,
  CONDITION_STATES,
  type CheckinMovementInput,
  type CheckoutMovementInput,
} from '../shared/validation.ts';
import type { EquipmentItem, MovementRecord } from '../types/domain.ts';

interface PdfPreviewModalProps {
  movementId: number | null;
  customPdfUrl?: string | null;
  title?: string;
  termLabel?: string;
  downloadFilename?: string;
  onClose: () => void;
}

export function PdfPreviewModal({
  movementId,
  customPdfUrl = null,
  title = 'Termo de Responsabilidade e Guarda de Equipamento',
  termLabel,
  downloadFilename,
  onClose,
}: PdfPreviewModalProps) {
  const { idToken } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const targetUrl =
    customPdfUrl || (movementId ? `/api/movements/${movementId}/term-pdf` : null);

  useEffect(() => {
    if (!targetUrl || !idToken) {
      setBlobUrl(null);
      return;
    }

    let active = true;
    let generatedUrl: string | null = null;
    setLoading(true);
    setError(null);

    fetchAuthorizedPdfBlobUrl(targetUrl, idToken)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        generatedUrl = url;
        setBlobUrl(url);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Erro ao gerar PDF.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [targetUrl, idToken]);

  if (!targetUrl) return null;

  const resolvedFilename =
    downloadFilename || `${termLabel || `documento-${movementId || 'patriti'}`}.pdf`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl h-[88vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {title}
              </h2>
              <p className="text-xs text-slate-500 font-mono truncate">
                {termLabel || (movementId ? `Movimentação #${movementId}` : 'Documento PatriTI')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {blobUrl && (
              <>
                <button
                  type="button"
                  onClick={() => iframeRef.current?.contentWindow?.print()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir</span>
                </button>
                <a
                  href={blobUrl}
                  download={resolvedFilename}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar visualização do PDF"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 p-4 overflow-hidden">
          {loading && (
            <div className="w-full h-full flex items-center justify-center text-sm text-slate-600">
              Gerando documento PDF assinado no servidor...
            </div>
          )}
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          {blobUrl && !loading && (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              title={title}
              className="w-full h-full rounded-lg border border-slate-300 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface CheckoutModalProps {
  open: boolean;
  availableEquipments: EquipmentItem[];
  preselectedEquipmentId?: number | null;
  onClose: () => void;
  onSuccess: (movement: MovementRecord) => void;
}

export function CheckoutModal({
  open,
  availableEquipments,
  preselectedEquipmentId,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const { departments, idToken } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutMovementInput>({
    resolver: zodResolver(checkoutMovementSchema),
    defaultValues: {
      equipmentId: preselectedEquipmentId || availableEquipments[0]?.id || 0,
      toDepartmentId: departments[0]?.id || 1,
      collaboratorName: '',
      collaboratorDocument: '',
      collaboratorRole: '',
      reason: 'Alocação para atividades operacionais do colaborador',
      conditionState: 'Excelente',
      accessoriesIncluded: '',
      notes: '',
    },
  });

  const selectedEquipId = watch('equipmentId');

  useEffect(() => {
    if (open) {
      setServerError(null);
      const targetId = preselectedEquipmentId || availableEquipments[0]?.id || 0;
      const eq = availableEquipments.find((item) => item.id === targetId);
      reset({
        equipmentId: targetId,
        toDepartmentId: eq?.departmentId || departments[0]?.id || 1,
        collaboratorName: '',
        collaboratorDocument: '',
        collaboratorRole: '',
        reason: 'Alocação para atividades operacionais do colaborador',
        conditionState: 'Excelente',
        accessoriesIncluded: eq?.accessories || '',
        notes: '',
      });
    }
  }, [open, preselectedEquipmentId, availableEquipments, departments, reset]);

  useEffect(() => {
    const eq = availableEquipments.find((item) => item.id === Number(selectedEquipId));
    if (eq?.accessories) {
      setValue('accessoriesIncluded', eq.accessories);
    }
  }, [selectedEquipId, availableEquipments, setValue]);

  if (!open) return null;

  const onSubmit = async (data: CheckoutMovementInput) => {
    if (!idToken) return;
    setServerError(null);
    try {
      const res = await apiFetch<{ movement: MovementRecord }>(
        '/api/movements/checkout',
        idToken,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      onSuccess(res.movement);
      onClose();
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Erro ao registrar saída.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Registrar Saída (Entrega / Alocação)
            </h2>
            <p className="text-xs text-slate-500">
              Altera o ativo para &ldquo;Em Uso&rdquo; e gera automaticamente o Termo de Responsabilidade em PDF.
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

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-5">
          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {serverError}
            </div>
          )}

          {availableEquipments.length === 0 ? (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Não há equipamentos com status &ldquo;Disponível&rdquo; no momento para saída.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Equipamento Disponível *
                </label>
                <select
                  {...register('equipmentId', { valueAsNumber: true })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {availableEquipments.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.assetTag} · {eq.brand} {eq.model} (S/N: {eq.serialNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nome do Colaborador Recebedor *
                  </label>
                  <input
                    {...register('collaboratorName')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="Ex: Ana Paula Ferreira"
                  />
                  {errors.collaboratorName && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.collaboratorName.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CPF / Matrícula *
                  </label>
                  <input
                    {...register('collaboratorDocument')}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="Ex: MAT-3091 ou 123.456.789-00"
                  />
                  {errors.collaboratorDocument && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.collaboratorDocument.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cargo *
                  </label>
                  <input
                    {...register('collaboratorRole')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="Ex: Coordenadora Comercial"
                  />
                  {errors.collaboratorRole && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.collaboratorRole.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Setor de Destino *
                  </label>
                  <select
                    {...register('toDepartmentId', { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Estado de Conservação na Entrega *
                  </label>
                  <select
                    {...register('conditionState')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {CONDITION_STATES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Acessórios Entregues
                  </label>
                  <input
                    {...register('accessoriesIncluded')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo da Entrega / Alocação *
                </label>
                <input
                  {...register('reason')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                />
                {errors.reason && (
                  <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Observações para o Termo
                </label>
                <textarea
                  rows={2}
                  {...register('notes')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  placeholder="Observações adicionais registradas no termo de responsabilidade..."
                />
              </div>
            </>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            {availableEquipments.length > 0 && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {isSubmitting ? 'Registrando e Gerando PDF...' : 'Confirmar Saída e Gerar Termo PDF'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

interface CheckinModalProps {
  open: boolean;
  returnableEquipments: EquipmentItem[];
  preselectedEquipmentId?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CheckinModal({
  open,
  returnableEquipments,
  preselectedEquipmentId,
  onClose,
  onSuccess,
}: CheckinModalProps) {
  const { departments, idToken } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const tiDept =
    departments.find((d) => d.code === 'TI')?.id || departments[0]?.id || 1;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckinMovementInput>({
    resolver: zodResolver(checkinMovementSchema),
    defaultValues: {
      equipmentId: preselectedEquipmentId || returnableEquipments[0]?.id || 0,
      toDepartmentId: tiDept,
      targetStatus: 'Disponível',
      collaboratorName: '',
      collaboratorDocument: '',
      collaboratorRole: '',
      reason: 'Devolução ao estoque de TI / Retorno de manutenção',
      conditionState: 'Bom',
      nextInspectionDate: '',
      notes: '',
      checklist: {
        powerOn: true,
        screenOrChassisIntact: true,
        portsAndConnectivityOk: true,
        peripheralsAndCablesComplete: true,
        storageWipedOrVerified: true,
        securitySealIntact: true,
      },
    },
  });

  const selectedEquipId = watch('equipmentId');

  useEffect(() => {
    if (open) {
      setServerError(null);
      const targetId = preselectedEquipmentId || returnableEquipments[0]?.id || 0;
      const eq = returnableEquipments.find((item) => item.id === targetId);
      reset({
        equipmentId: targetId,
        toDepartmentId: tiDept,
        targetStatus: 'Disponível',
        collaboratorName: eq?.currentHolderName || 'Equipe de TI',
        collaboratorDocument: eq?.currentHolderDocument || 'INFRA-TI',
        collaboratorRole: eq?.currentHolderRole || 'Recebimento Interno',
        reason: 'Devolução ao estoque de TI / Vistoria técnica de entrada',
        conditionState: 'Bom',
        nextInspectionDate: '',
        notes: '',
        checklist: {
          powerOn: true,
          screenOrChassisIntact: true,
          portsAndConnectivityOk: true,
          peripheralsAndCablesComplete: true,
          storageWipedOrVerified: true,
          securitySealIntact: true,
        },
      });
    }
  }, [open, preselectedEquipmentId, returnableEquipments, tiDept, reset]);

  useEffect(() => {
    const eq = returnableEquipments.find((item) => item.id === Number(selectedEquipId));
    if (eq) {
      setValue('collaboratorName', eq.currentHolderName || 'Equipe de TI');
      setValue('collaboratorDocument', eq.currentHolderDocument || 'INFRA-TI');
      setValue('collaboratorRole', eq.currentHolderRole || 'Recebimento Interno');
    }
  }, [selectedEquipId, returnableEquipments, setValue]);

  if (!open) return null;

  const onSubmit = async (data: CheckinMovementInput) => {
    if (!idToken) return;
    setServerError(null);
    try {
      await apiFetch('/api/movements/checkin', idToken, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Erro ao registrar entrada.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Registrar Entrada (Devolução / Vistoria Técnica)
            </h2>
            <p className="text-xs text-slate-500">
              Exige preenchimento do checklist de vistoria técnica e define o destino operacional do ativo.
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

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-5">
          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {serverError}
            </div>
          )}

          {returnableEquipments.length === 0 ? (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
              Nenhum ativo está atualmente &ldquo;Em Uso&rdquo; ou &ldquo;Em Manutenção&rdquo;.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Equipamento *
                  </label>
                  <select
                    {...register('equipmentId', { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {returnableEquipments.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.assetTag} · {eq.brand} {eq.model} ({eq.operationalStatus})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Novo Status Operacional *
                  </label>
                  <select
                    {...register('targetStatus')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    <option value="Disponível">Disponível (Aprovado em Estoque)</option>
                    <option value="Em Manutenção">Em Manutenção (Requer Reparo)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Devolvido por *
                  </label>
                  <input
                    {...register('collaboratorName')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                  {errors.collaboratorName && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.collaboratorName.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CPF / Matrícula *
                  </label>
                  <input
                    {...register('collaboratorDocument')}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Setor de Guarda / Estoque *
                  </label>
                  <select
                    {...register('toDepartmentId', { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checklist de Vistoria */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-900 mb-3">
                  Checklist Obrigatório de Vistoria no Recebimento
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('checklist.powerOn')}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Equipamento liga e inicializa normalmente</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('checklist.screenOrChassisIntact')}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Tela, carcaça e dobradiças sem trincas</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('checklist.portsAndConnectivityOk')}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Portas USB, vídeo, rede e Wi-Fi operacionais</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('checklist.peripheralsAndCablesComplete')}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Fontes, cabos e acessórios devolvidos</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('checklist.storageWipedOrVerified')}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Armazenamento e credenciais verificados</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('checklist.securitySealIntact')}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Etiqueta patrimonial e lacres íntegros</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Estado Físico Constatado *
                  </label>
                  <select
                    {...register('conditionState')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {CONDITION_STATES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Próxima Vistoria Prevista
                  </label>
                  <input
                    type="date"
                    {...register('nextInspectionDate')}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo da Devolução / Entrada *
                </label>
                <input
                  {...register('reason')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Avarias ou Observações da Vistoria
                </label>
                <textarea
                  rows={2}
                  {...register('notes')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  placeholder="Descreva qualquer avaria encontrada ou peças pendentes..."
                />
              </div>
            </>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            {returnableEquipments.length > 0 && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {isSubmitting ? 'Registrando...' : 'Confirmar Entrada & Vistoria'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
