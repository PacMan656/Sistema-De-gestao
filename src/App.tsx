import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Download,
  FileText,
  Laptop,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  Shield,
  Terminal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { LoginScreen, OnboardingScreen } from './components/AuthGate.tsx';
import { BarcodeScannerModal } from './components/BarcodeScannerModal.tsx';
import { EquipmentDetailDrawer } from './components/EquipmentDetailDrawer.tsx';
import { EquipmentFormModal } from './components/EquipmentFormModal.tsx';
import { HelpdeskRealtimeView } from './components/HelpdeskRealtimeView.tsx';
import {
  CheckinModal,
  CheckoutModal,
  PdfPreviewModal,
} from './components/MovementModals.tsx';
import { RemoteConsoleModal } from './components/RemoteConsoleModal.tsx';
import {
  IncidentStatusLabel,
  OperationalStatusLabel,
} from './components/StatusText.tsx';
import { SectorAdminView } from './components/SectorAdminView.tsx';
import { SectorInventoryView } from './components/SectorInventoryView.tsx';
import { LocalDataControls } from './components/LocalDataControls.tsx';
import { isLocalMode } from './lib/runtime.ts';
import { ChangePassword } from './components/ChangePassword.tsx';
import { PwaStatus } from './components/PwaStatus.tsx';
import { PrivacyNotice } from './components/PrivacyNotice.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { SocketProvider, useSocket } from './context/SocketContext.tsx';
import { apiFetch, downloadInventoryExport } from './lib/api.ts';
import {
  EQUIPMENT_TYPES,
  OPERATIONAL_STATUSES,
  OWNERSHIP_TYPES,
} from './shared/validation.ts';
import type {
  EquipmentItem,
  IncidentItem,
  MovementRecord,
} from './types/domain.ts';

type NavTab = 'overview' | 'inventory' | 'movements' | 'helpdesk' | 'users';

function WorkspaceApp() {
  const { appUser, departments, idToken, loading, logout } = useAuth();
  const { connected, liveAlerts, dismissAlert } = useSocket();

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(
    null
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [ownershipFilter, setOwnershipFilter] = useState('Todos');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [deptFilter, setDeptFilter] = useState<string>('Todos');

  // Modals & Drawers
  const [equipmentFormOpen, setEquipmentFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentItem | null>(
    null
  );
  const [prefillAssetTag, setPrefillAssetTag] = useState<string | null>(null);
  const [inventoryScannerOpen, setInventoryScannerOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [detailEquipmentId, setDetailEquipmentId] = useState<number | null>(null);
  const [remoteEquipment, setRemoteEquipment] = useState<EquipmentItem | null>(
    null
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [preselectedAssetId, setPreselectedAssetId] = useState<number | null>(null);
  const [pdfModal, setPdfModal] = useState<{
    movementId: number | null;
    customPdfUrl?: string | null;
    title?: string;
    termLabel?: string;
    downloadFilename?: string;
  }>({ movementId: null });

  const loadWorkspaceData = useCallback(async () => {
    if (!idToken || !appUser?.onboardingCompleted) return;
    setDataLoading(true);
    setDataError(null);
    try {
      if (appUser.role === 'admin_ti') {
        const [eqRes, movRes, incRes] = await Promise.all([
          apiFetch<EquipmentItem[]>('/api/equipments', idToken),
          apiFetch<MovementRecord[]>('/api/movements', idToken),
          apiFetch<IncidentItem[]>('/api/incidents', idToken),
        ]);
        setEquipments(eqRes);
        setMovements(movRes);
        setIncidents(incRes);
      } else {
        const [incRes, eqRes] = await Promise.all([
          apiFetch<IncidentItem[]>('/api/incidents', idToken),
          apiFetch<EquipmentItem[]>('/api/equipments', idToken),
        ]);
        setEquipments(eqRes);
        setMovements([]);
        setIncidents(incRes);
      }
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.'
      );
    } finally {
      setDataLoading(false);
    }
  }, [idToken, appUser?.onboardingCompleted, appUser?.role]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (appUser && appUser.role !== 'admin_ti' && !['helpdesk', 'inventory'].includes(activeTab)) {
      setActiveTab('inventory');
    }
  }, [appUser, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-600">Carregando sessão corporativa...</div>
      </div>
    );
  }

  if (!appUser) {
    return <LoginScreen />;
  }

  if (!appUser.onboardingCompleted) {
    return <OnboardingScreen />;
  }

  const isAdmin = appUser.role === 'admin_ti';

  const filteredEquipments = equipments.filter((eq) => {
    if (statusFilter !== 'Todos' && eq.operationalStatus !== statusFilter) {
      return false;
    }
    if (ownershipFilter !== 'Todos' && eq.ownershipType !== ownershipFilter) {
      return false;
    }
    if (typeFilter !== 'Todos' && eq.equipmentType !== typeFilter) {
      return false;
    }
    if (deptFilter !== 'Todos' && String(eq.departmentId) !== deptFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const match =
        eq.assetTag.toLowerCase().includes(q) ||
        eq.serialNumber.toLowerCase().includes(q) ||
        eq.brand.toLowerCase().includes(q) ||
        eq.model.toLowerCase().includes(q) ||
        (eq.currentHolderName || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const availableAssets = equipments.filter(
    (e) => e.operationalStatus === 'Disponível'
  );
  const returnableAssets = equipments.filter(
    (e) =>
      e.operationalStatus === 'Em Uso' || e.operationalStatus === 'Em Manutenção'
  );
  const openIncidentsCount = incidents.filter(
    (i) => i.status !== 'Resolvido'
  ).length;

  const navItems: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = isAdmin
    ? [
        { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
        { id: 'inventory', label: 'Inventário de TI', icon: Laptop },
        { id: 'movements', label: 'Movimentações', icon: ArrowLeftRight },
        { id: 'helpdesk', label: 'Helpdesk & Chat', icon: MessageSquare },
        { id: 'users', label: 'Setores e Acessos', icon: Shield },
      ]
    : [{ id: 'inventory', label: 'Equipamentos do Setor', icon: Laptop }, { id: 'helpdesk', label: 'Comunicação & Chamados', icon: MessageSquare }];

  const currentTab: NavTab = isAdmin || activeTab === 'inventory' || activeTab === 'helpdesk' ? activeTab : 'inventory';

  const activeNavLabel =
    navItems.find((n) => n.id === currentTab)?.label ||
    (isAdmin ? 'Visão Geral' : 'Comunicação & Chamados');

  const openNewEquipment = () => {
    setEditingEquipment(null);
    setPrefillAssetTag(null);
    setEquipmentFormOpen(true);
  };

  const openBarcodeLabelPdf = (eq: EquipmentItem) => {
    setPdfModal({
      movementId: null,
      customPdfUrl: `/api/equipments/${eq.id}/barcode-label-pdf`,
      title: `Etiqueta Patrimonial Código de Barras · ${eq.assetTag}`,
      termLabel: `${eq.brand} ${eq.model} · S/N: ${eq.serialNumber} · Setor ${eq.departmentCode}`,
      downloadFilename: `etiqueta-${eq.assetTag}.pdf`,
    });
  };

  const handleInventoryBarcodeLookup = async (code: string) => {
    if (!idToken) return;
    setNotFoundBarcode(null);
    setSearchQuery(code);
    try {
      const found = await apiFetch<EquipmentItem>(
        `/api/equipments/by-barcode/${encodeURIComponent(code)}`,
        idToken
      );
      setDetailEquipmentId(found.id);
    } catch {
      setNotFoundBarcode(code);
    }
  };

  const handleExportInventory = async (format: 'csv' | 'pdf') => {
    if (!idToken || exportingFormat) return;
    setExportingFormat(format);
    setDataError(null);
    try {
      await downloadInventoryExport(
        format,
        {
          search: searchQuery,
          status: statusFilter,
          ownershipType: ownershipFilter,
          equipmentType: typeFilter,
          departmentId: deptFilter,
        },
        idToken
      );
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : 'Erro ao exportar inventário.'
      );
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="workspace-shell bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          <div className="h-16 px-6 border-b border-slate-200 flex items-center">
            <span className="font-display font-bold text-lg tracking-tight text-slate-900 whitespace-nowrap">
              PatriTI
            </span>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'helpdesk' && openIncidentsCount > 0 && (
                    <span
                      className={`font-mono tabular-nums text-xs ${
                        active ? 'text-amber-300' : 'text-red-600 font-semibold'
                      }`}
                    >
                      {openIncidentsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 truncate">
              {appUser.departmentName || appUser.fullName}
            </p>
            <p className="text-slate-500 truncate">
              {isAdmin ? 'Admin / Técnico de TI' : 'Colaborador'} ·{' '}
              {appUser.departmentCode || 'SETOR'}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/40 flex">
          <div role="dialog" aria-modal="true" aria-label="Navegação" className="w-64 max-w-[85vw] bg-white h-full overflow-y-auto border-r border-slate-200 flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <span className="font-display font-bold text-lg text-slate-900">
                  PatriTI
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Fechar menu"
                  className="p-1.5 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2.5 ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={logout}
              className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
            >
              Encerrar Sessão
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir navegação"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">PatriTI</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-4 shrink-0">
            {isAdmin && <ChangePassword />}
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{isLocalMode ? 'Dados neste navegador' : connected ? 'Tempo Real Conectado' : 'Conectando...'}</span>
            </span>

            {isAdmin ? (
              <button
                type="button"
                onClick={openNewEquipment}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo Equipamento</span><span className="sm:hidden">Novo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('helpdesk')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Abrir Chamado TI</span><span className="sm:hidden">Chamado</span>
              </button>
            )}
          </div>
        </header>

        {/* Real-Time TI Triage Alert Banner */}
        {isAdmin && liveAlerts.length > 0 && (
          <div className="bg-red-600 text-white px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-medium">
              <Bell className="w-4 h-4 shrink-0" />
              <span>
                Novo Incidente ({liveAlerts[0].ticketCode}) em{' '}
                <strong>{liveAlerts[0].departmentName}</strong>:{' '}
                {liveAlerts[0].title} — Solicitado por{' '}
                {liveAlerts[0].requesterName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('helpdesk');
                  dismissAlert(liveAlerts[0].id);
                }}
                className="px-3 py-1 bg-white text-red-700 text-xs font-semibold rounded-md cursor-pointer"
              >
                Atender Agora
              </button>
              <button
                type="button"
                onClick={() => dismissAlert(liveAlerts[0].id)}
                aria-label="Dispensar alerta"
                className="p-1 text-red-100 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-6">
          {dataError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={loadWorkspaceData}
                className="text-xs font-semibold underline cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* OVERVIEW TAB (TI Only) */}
          {isAdmin && currentTab === 'overview' && (
            <div className="space-y-6">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Total de Ativos</p>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                    {equipments.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Disponíveis em Estoque</p>
                  <p className="mt-1.5 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
                    {availableAssets.length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Em Uso / Alocados</p>
                  <p className="mt-1.5 text-2xl font-bold text-blue-700 font-mono tabular-nums">
                    {
                      equipments.filter((e) => e.operationalStatus === 'Em Uso')
                        .length
                    }
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">Em Manutenção</p>
                  <p className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
                    {
                      equipments.filter(
                        (e) => e.operationalStatus === 'Em Manutenção'
                      ).length
                    }
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 lg:col-span-1">
                  <p className="text-xs text-slate-500">Incidentes Ativos</p>
                  <p className="mt-1.5 text-2xl font-bold text-red-700 font-mono tabular-nums">
                    {openIncidentsCount}
                  </p>
                </div>
              </div>

              {/* Action Strip for Admin TI */}
              {isAdmin && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Operações Rápidas de Movimentação e Termos
                    </h2>
                    <p className="text-xs text-slate-500">
                      Registre entregas com emissão automática do Termo de Responsabilidade ou devoluções com checklist técnico.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedAssetId(null);
                        setCheckoutOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Registrar Saída (Entrega)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedAssetId(null);
                        setCheckinOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Registrar Entrada (Vistoria)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Two-column Overview: Recent Movements & Recent Incidents */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">
                      Últimas Movimentações Imutáveis
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('movements')}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Ver Histórico
                    </button>
                  </div>
                  {movements.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Nenhuma movimentação registrada ainda.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {movements.slice(0, 5).map((m) => (
                        <div
                          key={m.id}
                          className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {m.movementType === 'SAIDA' ? 'Saída' : 'Entrada'} ·{' '}
                              <span className="font-mono">{m.assetTag}</span>
                            </p>
                            <p className="text-slate-500 truncate">
                              {m.collaboratorName} · {m.collaboratorDepartment}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {m.movementType === 'SAIDA' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPdfModal({
                                    movementId: m.id,
                                    termLabel: m.termNumber || `TRM-${m.id}`,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </button>
                            )}
                            <span className="font-mono text-slate-400 tabular-nums">
                              {new Intl.DateTimeFormat('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                              }).format(new Date(m.occurredAt))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">
                      Chamados Helpdesk Recentes
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('helpdesk')}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Abrir Central
                    </button>
                  </div>
                  {incidents.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Nenhum chamado registrado até o momento.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {incidents.slice(0, 5).map((inc) => (
                        <div
                          key={inc.id}
                          className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              <span className="font-mono">{inc.ticketCode}</span> ·{' '}
                              {inc.title}
                            </p>
                            <p className="text-slate-500 truncate">
                              {inc.departmentCode} · {inc.requesterName}
                            </p>
                          </div>
                          <IncidentStatusLabel status={inc.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* INVENTORY TAB (TI Only) */}
          {isAdmin && currentTab === 'inventory' && (
            <div className="space-y-4">
              {/* Filter, Barcode Scan & Export Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap sm:flex-nowrap flex-1 items-center gap-2 min-w-0 w-full sm:min-w-[260px]">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          if (notFoundBarcode) setNotFoundBarcode(null);
                        }}
                        placeholder="Buscar por patrimônio, série, marca, modelo ou colaborador..."
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setInventoryScannerOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <ScanBarcode className="w-4 h-4 text-blue-600" />
                      <span>Ler Código</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Todos">Todos os Tipos</option>
                      {EQUIPMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    <select
                      value={ownershipFilter}
                      onChange={(e) => setOwnershipFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Todos">Todas Propriedades</option>
                      {OWNERSHIP_TYPES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>

                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Todos">Todos os Setores</option>
                      {departments.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.code} · {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {notFoundBarcode && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
                    <span>
                      Código de barras <strong className="font-mono">{notFoundBarcode}</strong> não encontrado no inventário atual. Deseja numerar e cadastrar um novo equipamento com este código?
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEquipment(null);
                          setPrefillAssetTag(notFoundBarcode);
                          setNotFoundBarcode(null);
                          setEquipmentFormOpen(true);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-md cursor-pointer"
                      >
                        Cadastrar com {notFoundBarcode}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotFoundBarcode(null)}
                        className="p-1 text-amber-700 hover:text-amber-900 cursor-pointer"
                        aria-label="Fechar aviso"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Segmented Status Filter */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit max-w-full overflow-x-auto">
                    {['Todos', ...OPERATIONAL_STATUSES].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                          statusFilter === st
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  {/* Inventory Export Actions (TI Only) */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={exportingFormat !== null}
                      onClick={() => handleExportInventory('csv')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {exportingFormat === 'csv'
                          ? 'Exportando...'
                          : 'Exportar CSV'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingFormat !== null}
                      onClick={() => handleExportInventory('pdf')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        {exportingFormat === 'pdf'
                          ? 'Gerando PDF...'
                          : 'Exportar PDF'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Inventory Data Grid */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {dataLoading ? (
                  <div className="p-6 space-y-2.5">
                    {[1, 2, 3, 4].map((row) => (
                      <div
                        key={row}
                        className="h-10 bg-slate-100 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredEquipments.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      Nenhum equipamento encontrado para os filtros aplicados.
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={openNewEquipment}
                        className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Cadastrar Novo Equipamento
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-2.5 px-4">Patrimônio / Série</th>
                          <th className="py-2.5 px-4">Equipamento</th>
                          <th className="py-2.5 px-4">Setor / Conexão</th>
                          <th className="py-2.5 px-4">Propriedade</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Ações TI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredEquipments.map((eq) => (
                          <tr
                            key={eq.id}
                            onClick={() => setDetailEquipmentId(eq.id)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="py-3 px-4 font-mono">
                              <div className="font-semibold text-slate-900">
                                {eq.assetTag}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {eq.serialNumber}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">
                                {eq.brand} {eq.model}
                              </div>
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                {eq.equipmentType} · {eq.manufactureYear}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-slate-900">
                                {eq.departmentCode} · {eq.departmentName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {eq.connectionInterface && eq.connectionInterface !== 'N/A'
                                  ? `${eq.connectionInterface}${eq.networkAddress ? ` · ${eq.networkAddress}` : ''}`
                                  : eq.currentHolderName || 'Em estoque TI'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              <div>{eq.ownershipType}</div>
                              {eq.contractNumber && (
                                <div className="text-[11px] font-mono text-slate-500">
                                  {eq.contractNumber}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <OperationalStatusLabel
                                status={eq.operationalStatus}
                              />
                            </td>
                            <td
                              className="py-3 px-4 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                {eq.connectionInterface !== 'N/A' && (
                                  <button
                                    type="button"
                                    onClick={() => setRemoteEquipment(eq)}
                                    title="Conexão Remota / Página de Teste"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
                                  >
                                    <Terminal className="w-3.5 h-3.5" />
                                    <span>Remoto</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openBarcodeLabelPdf(eq)}
                                  title="Imprimir Etiqueta Código de Barras"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>Etiqueta</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MOVEMENTS TAB (TI Only) */}
          {isAdmin && currentTab === 'movements' && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-600">
                    Todas as entregas, devoluções e vistorias são gravadas como registros imutáveis no PostgreSQL.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedAssetId(null);
                        setCheckoutOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Registrar Saída</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedAssetId(null);
                        setCheckinOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Registrar Entrada</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {movements.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    Nenhuma movimentação registrada até o momento.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-2.5 px-4">Data / Hora</th>
                          <th className="py-2.5 px-4">Tipo / Status</th>
                          <th className="py-2.5 px-4">Patrimônio / Equipamento</th>
                          <th className="py-2.5 px-4">Colaborador / Setor</th>
                          <th className="py-2.5 px-4">Estado</th>
                          <th className="py-2.5 px-4 text-right">Termo PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {movements.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {new Intl.DateTimeFormat('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date(m.occurredAt))}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">
                                {m.movementType === 'SAIDA'
                                  ? 'Saída (Entrega)'
                                  : 'Entrada (Devolução)'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {m.previousStatus} → {m.newStatus}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-mono font-semibold text-slate-900">
                                {m.assetTag}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {m.equipmentBrand} {m.equipmentModel}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-slate-900 font-medium">
                                {m.collaboratorName} ({m.collaboratorDocument})
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {m.collaboratorRole} · {m.collaboratorDepartment}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {m.conditionState}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {m.movementType === 'SAIDA' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPdfModal({
                                      movementId: m.id,
                                      termLabel: m.termNumber || `TRM-${m.id}`,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-md cursor-pointer whitespace-nowrap"
                                >
                                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                                  <span>{m.termNumber || 'Emitir PDF'}</span>
                                </button>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HELPDESK REALTIME TAB */}
          {currentTab === 'helpdesk' && <HelpdeskRealtimeView />}

          {/* USERS & RBAC ADMIN TAB */}
          {currentTab === 'users' && isAdmin && <SectorAdminView />}
          {!isAdmin && currentTab === 'inventory' && <SectorInventoryView equipment={equipments} loading={dataLoading} onSelect={setDetailEquipmentId} />}
        </main>
      </div>

      {/* Modals & Drawers */}
      <EquipmentFormModal
        open={equipmentFormOpen}
        editingEquipment={editingEquipment}
        prefillAssetTag={prefillAssetTag}
        onClose={() => {
          setEquipmentFormOpen(false);
          setPrefillAssetTag(null);
        }}
        onSaved={(saved) => {
          loadWorkspaceData();
          if (saved && !editingEquipment) {
            setDetailEquipmentId(saved.id);
          }
        }}
      />

      <EquipmentDetailDrawer
        equipmentId={detailEquipmentId}
        onClose={() => setDetailEquipmentId(null)}
        onEdit={(eq) => {
          setDetailEquipmentId(null);
          setEditingEquipment(eq);
          setPrefillAssetTag(null);
          setEquipmentFormOpen(true);
        }}
        onCheckout={(eq) => {
          setDetailEquipmentId(null);
          setPreselectedAssetId(eq.id);
          setCheckoutOpen(true);
        }}
        onCheckin={(eq) => {
          setDetailEquipmentId(null);
          setPreselectedAssetId(eq.id);
          setCheckinOpen(true);
        }}
        onOpenPdf={(movementId, termLabel) =>
          setPdfModal({ movementId, termLabel })
        }
        onOpenRemoteConsole={(eq) => {
          setDetailEquipmentId(null);
          setRemoteEquipment(eq);
        }}
        onOpenBarcodeLabel={(eq) => {
          openBarcodeLabelPdf(eq);
        }}
      />

      <BarcodeScannerModal
        open={inventoryScannerOpen}
        title="Consultar ou Numerar Ativo por Código de Barras"
        onDetected={handleInventoryBarcodeLookup}
        onClose={() => setInventoryScannerOpen(false)}
      />

      <RemoteConsoleModal
        equipment={remoteEquipment}
        onClose={() => setRemoteEquipment(null)}
        onStatusUpdated={loadWorkspaceData}
      />

      <CheckoutModal
        open={checkoutOpen}
        availableEquipments={availableAssets}
        preselectedEquipmentId={preselectedAssetId}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={(mov) => {
          loadWorkspaceData();
          setPdfModal({
            movementId: mov.id,
            termLabel: mov.termNumber || `TRM-${mov.id}`,
          });
        }}
      />

      <CheckinModal
        open={checkinOpen}
        returnableEquipments={returnableAssets}
        preselectedEquipmentId={preselectedAssetId}
        onClose={() => setCheckinOpen(false)}
        onSuccess={loadWorkspaceData}
      />

      <PdfPreviewModal
        movementId={pdfModal.movementId}
        customPdfUrl={pdfModal.customPdfUrl}
        title={pdfModal.title}
        termLabel={pdfModal.termLabel}
        downloadFilename={pdfModal.downloadFilename}
        onClose={() => setPdfModal({ movementId: null })}
      />
    </div>
  );
}

function SessionWorkspace() {
  const { appUser } = useAuth();
  return <WorkspaceApp key={appUser ? `${appUser.id}:${appUser.departmentId}:${appUser.role}` : 'login'} />;
}

export default function App() {
  return (
    <><PwaStatus />
    <AuthProvider>
      <LocalDataControls />
      <SocketProvider>
        <SessionWorkspace />
      </SocketProvider>
    </AuthProvider>
    <PrivacyNotice />
    </>
  );
}
