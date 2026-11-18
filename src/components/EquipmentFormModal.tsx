import { zodResolver } from '@hookform/resolvers/zod';
import { ScanBarcode, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import {
  CONNECTION_INTERFACES,
  CONNECTION_STATUSES,
  EQUIPMENT_TYPES,
  equipmentFormSchema,
  OPERATIONAL_STATUSES,
  OWNERSHIP_TYPES,
  type EquipmentFormInput,
} from '../shared/validation.ts';
import type { EquipmentItem } from '../types/domain.ts';
import { BarcodeScannerModal } from './BarcodeScannerModal.tsx';
import { Code128Svg } from './Code128Svg.tsx';

interface EquipmentFormModalProps {
  open: boolean;
  editingEquipment: EquipmentItem | null;
  prefillAssetTag?: string | null;
  onClose: () => void;
  onSaved: (savedEquipment?: EquipmentItem) => void;
}

export function EquipmentFormModal({
  open,
  editingEquipment,
  prefillAssetTag = null,
  onClose,
  onSaved,
}: EquipmentFormModalProps) {
  const { departments, idToken } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [availableEquipments, setAvailableEquipments] = useState<EquipmentItem[]>([]);
  const [scanTarget, setScanTarget] = useState<'assetTag' | 'serialNumber' | null>(
    null
  );
  const [scanLookupHint, setScanLookupHint] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentFormInput>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      assetTag: '',
      serialNumber: '',
      parentEquipmentId: null,
      linkedEquipmentIds: [],
      equipmentType: 'Notebook',
      brand: '',
      model: '',
      departmentId: departments.find((sector) => sector.accessConfigured)?.id || 1,
      responsibleCompany: 'Matriz Corporativa S.A.',
      ownershipType: 'Próprio',
      contractNumber: '',
      supplierName: '',
      contractEndDate: '',
      operationalStatus: 'Disponível',
      manufactureYear: new Date().getFullYear(),
      lastInspectionDate: '',
      nextInspectionDate: '',
      accessories: '',
      notes: '',
      connectionInterface: 'N/A',
      networkAddress: '',
      portNumber: null,
      connectionStatus: 'Não Verificado',
    },
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      setScanLookupHint(null);
      if (editingEquipment) {
        reset({
          assetTag: editingEquipment.assetTag,
          serialNumber: editingEquipment.serialNumber,
          parentEquipmentId: editingEquipment.parentEquipmentId ?? null,
          linkedEquipmentIds: editingEquipment.linkedEquipmentIds ?? [],
          equipmentType:
            editingEquipment.equipmentType as EquipmentFormInput['equipmentType'],
          brand: editingEquipment.brand,
          model: editingEquipment.model,
          departmentId: editingEquipment.departmentId,
          responsibleCompany: editingEquipment.responsibleCompany,
          ownershipType: editingEquipment.ownershipType,
          contractNumber: editingEquipment.contractNumber || '',
          supplierName: editingEquipment.supplierName || '',
          contractEndDate: editingEquipment.contractEndDate || '',
          operationalStatus: editingEquipment.operationalStatus,
          manufactureYear: editingEquipment.manufactureYear,
          lastInspectionDate: editingEquipment.lastInspectionDate || '',
          nextInspectionDate: editingEquipment.nextInspectionDate || '',
          accessories: editingEquipment.accessories || '',
          notes: editingEquipment.notes || '',
          connectionInterface:
            (editingEquipment.connectionInterface as EquipmentFormInput['connectionInterface']) ||
            'N/A',
          networkAddress: editingEquipment.networkAddress || '',
          portNumber: editingEquipment.portNumber ?? null,
          connectionStatus:
            (editingEquipment.connectionStatus as EquipmentFormInput['connectionStatus']) ||
            'Não Verificado',
        });
      } else {
        reset({
          assetTag: prefillAssetTag || '',
          serialNumber: '',
          parentEquipmentId: null,
          linkedEquipmentIds: [],
          equipmentType: 'Notebook',
          brand: '',
          model: '',
          departmentId: departments.find((sector) => sector.accessConfigured)?.id || 1,
          responsibleCompany: 'Matriz Corporativa S.A.',
          ownershipType: 'Próprio',
          contractNumber: '',
          supplierName: '',
          contractEndDate: '',
          operationalStatus: 'Disponível',
          manufactureYear: new Date().getFullYear(),
          lastInspectionDate: new Date().toISOString().slice(0, 10),
          nextInspectionDate: '',
          accessories: '',
          notes: '',
          connectionInterface: 'N/A',
          networkAddress: '',
          portNumber: null,
          connectionStatus: 'Não Verificado',
        });
      }
    }
  }, [open, editingEquipment, prefillAssetTag, departments, reset]);

  useEffect(() => {
    if (!open || !idToken) return;
    let active = true;
    apiFetch<EquipmentItem[]>('/api/equipments', idToken).then((rows) => {
      if (active) setAvailableEquipments(rows);
    }).catch(() => { if (active) setServerError('Não foi possível carregar os equipamentos para vínculo.'); });
    return () => { active = false; };
  }, [open, idToken]);

  const ownershipType = watch('ownershipType');
  const assetTagValue = watch('assetTag');
  const serialNumberValue = watch('serialNumber');
  const connectionInterfaceValue = watch('connectionInterface');
  const departmentId = watch('departmentId');
  const equipmentType = watch('equipmentType');
  const linkedIds = watch('linkedEquipmentIds') || [];
  const computer = equipmentType === 'Desktop' || equipmentType === 'Notebook';
  const candidates = availableEquipments.filter((item) => item.id !== editingEquipment?.id && item.departmentId === departmentId);
  const requiresContract =
    ownershipType === 'Alugado' || ownershipType === 'Contratado';

  if (!open) return null;

  const handleBarcodeDetected = async (code: string) => {
    if (!scanTarget) return;
    setValue(scanTarget, code, { shouldValidate: true, shouldDirty: true });
    setScanLookupHint(null);

    if (!editingEquipment && idToken) {
      try {
        const existing = await apiFetch<EquipmentItem>(
          `/api/equipments/by-barcode/${encodeURIComponent(code)}`,
          idToken
        );
        setScanLookupHint(
          `Atenção: O código ${code} já está vinculado ao ativo ${existing.assetTag} (${existing.brand} ${existing.model} · ${existing.departmentCode}).`
        );
      } catch {
        setScanLookupHint(
          `Código ${code} lido com sucesso e preenchido para nova numeração de inventário.`
        );
      }
    }
  };

  const onSubmit = async (data: EquipmentFormInput) => {
    if (!idToken) return;
    setServerError(null);
    try {
      let saved: EquipmentItem;
      if (editingEquipment) {
        saved = await apiFetch<EquipmentItem>(
          `/api/equipments/${editingEquipment.id}`,
          idToken,
          {
            method: 'PUT',
            body: JSON.stringify(data),
          }
        );
      } else {
        saved = await apiFetch<EquipmentItem>('/api/equipments', idToken, {
          method: 'POST',
          body: JSON.stringify(data),
        });
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Falha ao salvar equipamento.'
      );
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {editingEquipment
                  ? `Editar Ativo · ${editingEquipment.assetTag}`
                  : 'Cadastrar Equipamento de TI'}
              </h2>
              <p className="text-xs text-slate-500">
                Utilize o leitor de código de barras na numeração, informe o vínculo contratual e configure o acesso remoto do setor.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar formulário"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="p-6 overflow-y-auto space-y-6"
          >
            {serverError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {serverError}
              </div>
            )}

            {scanLookupHint && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                {scanLookupHint}
              </div>
            )}

            {/* 1. Identificação e Leitura de Código de Barras */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
                01. Identificação do Ativo e Código de Barras
              </h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Número de Patrimônio *
                    </label>
                    <button
                      type="button"
                      onClick={() => setScanTarget('assetTag')}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      <ScanBarcode className="w-3.5 h-3.5" />
                      <span>Ler Código</span>
                    </button>
                  </div>
                  <input
                    {...register('assetTag')}
                    className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="PAT-TI-0045"
                  />
                  {errors.assetTag && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.assetTag.message}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Número de Série *
                    </label>
                    <button
                      type="button"
                      onClick={() => setScanTarget('serialNumber')}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      <ScanBarcode className="w-3.5 h-3.5" />
                      <span>Ler Código</span>
                    </button>
                  </div>
                  <input
                    {...register('serialNumber')}
                    className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="SN-99281726A"
                  />
                  {errors.serialNumber && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.serialNumber.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipo de Equipamento *
                  </label>
                  <select
                    {...register('equipmentType', { onChange: () => { setValue('parentEquipmentId', null); setValue('linkedEquipmentIds', []); } })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {EQUIPMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(assetTagValue.trim().length >= 3 ||
                serialNumberValue.trim().length >= 3) && (
                <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {assetTagValue.trim().length >= 3 && (
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <Code128Svg
                        value={assetTagValue.trim().toUpperCase()}
                        label="Etiqueta Patrimonial (Code 128)"
                        height={30}
                      />
                    </div>
                  )}
                  {serialNumberValue.trim().length >= 3 && (
                    <div className="bg-white p-2.5 rounded border border-slate-200">
                      <Code128Svg
                        value={serialNumberValue.trim().toUpperCase()}
                        label="Número de Série (Code 128)"
                        height={30}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Marca *
                  </label>
                  <input
                    {...register('brand')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="Dell, Lenovo, HP, Cisco..."
                  />
                  {errors.brand && (
                    <p className="mt-1 text-xs text-red-600">{errors.brand.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Modelo *
                  </label>
                  <input
                    {...register('model')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    placeholder="Latitude 5440 i7 16GB"
                  />
                  {errors.model && (
                    <p className="mt-1 text-xs text-red-600">{errors.model.message}</p>
                  )}
                </div>
              </div>
            </div>

            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <h3 className="font-semibold text-sm text-blue-900">{computer ? 'Equipamentos e periféricos deste computador' : 'Vincular a um computador'}</h3>
              <p className="text-xs text-slate-600">Cada ativo mantém seu patrimônio e pertence ao mesmo setor do computador. Um desktop ou notebook pode ter vários equipamentos vinculados.</p>
              {computer ? <div className="max-h-52 overflow-y-auto space-y-2">
                {candidates.filter((item) => !['Desktop', 'Notebook'].includes(item.equipmentType) && (!item.parentEquipmentId || item.parentEquipmentId === editingEquipment?.id)).map((item) => <label key={item.id} className="flex gap-3 items-start bg-white p-3 rounded-lg text-sm"><input type="checkbox" checked={linkedIds.includes(item.id)} onChange={(event) => setValue('linkedEquipmentIds', event.target.checked ? [...linkedIds, item.id] : linkedIds.filter((id) => id !== item.id), { shouldDirty: true })} className="mt-1" /><span><strong>{item.assetTag}</strong> — {item.equipmentType} · {item.brand} {item.model}</span></label>)}
                {!candidates.some((item) => !['Desktop', 'Notebook'].includes(item.equipmentType) && (!item.parentEquipmentId || item.parentEquipmentId === editingEquipment?.id)) && <p className="text-xs text-slate-500">Nenhum periférico disponível neste setor. Cadastre os periféricos e depois vincule-os ao computador.</p>}
              </div> : <label className="block text-sm font-medium">Computador principal<select className="form-input mt-1.5" value={watch('parentEquipmentId') ?? ''} onChange={(event) => setValue('parentEquipmentId', event.target.value ? Number(event.target.value) : null, { shouldDirty: true })}><option value="">Sem vínculo com computador</option>{candidates.filter((item) => ['Desktop', 'Notebook'].includes(item.equipmentType)).map((item) => <option key={item.id} value={item.id}>{item.assetTag} — {item.brand} {item.model}</option>)}</select></label>}
            </section>
            {/* 2. Alocação, Status e Propriedade */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
                02. Alocação, Propriedade e Status
              </h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Setor / Departamento Atual *
                  </label>
                  <select
                    {...register('departmentId', { valueAsNumber: true, onChange: () => { setValue('parentEquipmentId', null); setValue('linkedEquipmentIds', []); } })}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {departments.filter((sector) => sector.accessConfigured).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Empresa Responsável (Proprietária ou Locadora) *
                  </label>
                  <input
                    {...register('responsibleCompany')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                  {errors.responsibleCompany && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.responsibleCompany.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipo de Propriedade *
                  </label>
                  <select
                    {...register('ownershipType')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {OWNERSHIP_TYPES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Operacional *
                  </label>
                  <select
                    {...register('operationalStatus')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {OPERATIONAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ano de Fabricação / Aquisição *
                  </label>
                  <input
                    type="number"
                    {...register('manufactureYear', { valueAsNumber: true })}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                  {errors.manufactureYear && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.manufactureYear.message}
                    </p>
                  )}
                </div>
              </div>

              {requiresContract && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nº do Contrato *
                    </label>
                    <input
                      {...register('contractNumber')}
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                      placeholder="CTR-LOC-2026-01"
                    />
                    {errors.contractNumber && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.contractNumber.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Fornecedor / Locadora *
                    </label>
                    <input
                      {...register('supplierName')}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                      placeholder="Razão Social do Fornecedor"
                    />
                    {errors.supplierName && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.supplierName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Vigência do Contrato
                    </label>
                    <input
                      type="date"
                      {...register('contractEndDate')}
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Ciclo de Vida e Auditoria */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
                03. Ciclo de Vida e Auditoria
              </h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data da Última Vistoria
                  </label>
                  <input
                    type="date"
                    {...register('lastInspectionDate')}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data da Próxima Vistoria Prevista
                  </label>
                  <input
                    type="date"
                    {...register('nextInspectionDate')}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Acessórios Inclusos
                </label>
                <input
                  {...register('accessories')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  placeholder="Ex: Fonte USB-C 65W, Mouse sem fio, Cabo HDMI, Mochila"
                />
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Observações Gerais (Estado físico, avarias, histórico)
                </label>
                <textarea
                  rows={3}
                  {...register('notes')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  placeholder="Registre detalhes sobre estado estético, bateria, lacres ou observações técnicas."
                />
              </div>
            </div>

            {/* 4. Conectividade e Acesso Remoto */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100">
                04. Conectividade, Cabo / USB e Acesso Remoto
              </h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Interface de Conexão
                  </label>
                  <select
                    {...register('connectionInterface')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    {CONNECTION_INTERFACES.map((iface) => (
                      <option key={iface} value={iface}>
                        {iface}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Endereço IP / Host / Porta USB
                  </label>
                  <input
                    {...register('networkAddress')}
                    disabled={connectionInterfaceValue === 'N/A'}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900 disabled:bg-slate-50"
                    placeholder={
                      connectionInterfaceValue === 'USB Local'
                        ? 'USB001 @ WS-FIN-04'
                        : '10.40.0.32'
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Porta TCP
                  </label>
                  <input
                    type="number"
                    {...register('portNumber', {
                      setValueAs: (v) =>
                        v === '' || v === null || v === undefined || Number.isNaN(Number(v))
                          ? null
                          : Number(v),
                    })}
                    disabled={
                      connectionInterfaceValue === 'N/A' ||
                      connectionInterfaceValue === 'USB Local'
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900 disabled:bg-slate-50"
                    placeholder="9100"
                  />
                  {errors.portNumber && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.portNumber.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 sm:max-w-xs">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Estado da Conexão no Setor
                </label>
                <select
                  {...register('connectionStatus')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {CONNECTION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {isSubmitting
                  ? 'Salvando...'
                  : editingEquipment
                    ? 'Salvar Alterações'
                    : 'Cadastrar Equipamento'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <BarcodeScannerModal
        open={scanTarget !== null}
        title={
          scanTarget === 'serialNumber'
            ? 'Ler Código de Barras · Número de Série'
            : 'Ler Código de Barras · Patrimônio'
        }
        onDetected={handleBarcodeDetected}
        onClose={() => setScanTarget(null)}
      />
    </>
  );
}
