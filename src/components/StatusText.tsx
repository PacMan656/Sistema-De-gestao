import { AlertTriangle, CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';

export function OperationalStatusLabel({ status }: { status: string }) {
  switch (status) {
    case 'Disponível':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Disponível</span>
        </span>
      );
    case 'Em Uso':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Em Uso</span>
        </span>
      );
    case 'Em Manutenção':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Wrench className="w-3.5 h-3.5 shrink-0" />
          <span>Em Manutenção</span>
        </span>
      );
    case 'Baixado/Descartado':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Baixado/Descartado</span>
        </span>
      );
    default:
      return <span className="text-xs text-slate-600">{status}</span>;
  }
}

export function IncidentStatusLabel({ status }: { status: string }) {
  switch (status) {
    case 'Aberto':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Aberto</span>
        </span>
      );
    case 'Em Atendimento':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Em Atendimento</span>
        </span>
      );
    case 'Resolvido':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Resolvido</span>
        </span>
      );
    default:
      return <span className="text-xs text-slate-600">{status}</span>;
  }
}

export function PriorityLabel({ priority }: { priority: string }) {
  const colorClass =
    priority === 'Crítica'
      ? 'text-red-700 font-semibold'
      : priority === 'Alta'
        ? 'text-amber-700 font-semibold'
        : priority === 'Média'
          ? 'text-slate-700 font-medium'
          : 'text-slate-500 font-normal';

  return <span className={`text-xs whitespace-nowrap ${colorClass}`}>{priority}</span>;
}
