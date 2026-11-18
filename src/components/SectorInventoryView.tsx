import { useState } from 'react';
import type { EquipmentItem } from '../types/domain.ts';
import { OperationalStatusLabel } from './StatusText.tsx';

export function SectorInventoryView({ equipment, loading, onSelect }: { equipment: EquipmentItem[]; loading: boolean; onSelect: (id: number) => void }) {
  const [search, setSearch] = useState('');
  const visible = equipment.filter((item) => `${item.assetTag} ${item.serialNumber} ${item.brand} ${item.model}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4"><div><h1 className="text-xl font-bold">Equipamentos do setor</h1><p className="text-sm text-slate-500 mt-1">{equipment.length} equipamentos cadastrados. Os vínculos de computadores e periféricos são gerenciados pelo TI.</p></div><label className="block text-sm font-medium">Buscar equipamento<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patrimônio, série, marca ou modelo" className="form-input mt-1.5" /></label>
    {loading ? <p className="text-sm text-slate-500">Carregando inventário...</p> : visible.length === 0 ? <p className="text-sm text-slate-500 p-6 bg-white rounded-xl border border-slate-200">Nenhum equipamento encontrado neste setor.</p> : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{visible.map((item) => {
      const parent = equipment.find((candidate) => candidate.id === item.parentEquipmentId);
      const children = equipment.filter((candidate) => candidate.parentEquipmentId === item.id);
      return <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-400 min-w-0"><span className="text-xs font-mono font-bold text-blue-700">{item.assetTag}</span><h2 className="text-sm font-bold mt-2 break-words">{item.brand} {item.model}</h2><p className="text-xs text-slate-500 mt-1">{item.equipmentType}</p><div className="mt-3"><OperationalStatusLabel status={item.operationalStatus} /></div>{parent && <p className="text-xs text-slate-600 mt-3">Vinculado a: <strong>{parent.assetTag}</strong></p>}{children.length > 0 && <p className="text-xs text-slate-600 mt-3">{children.length} equipamentos vinculados: {children.map((child) => child.assetTag).join(', ')}</p>}</button>;
    })}</div>}
  </section>;
}
