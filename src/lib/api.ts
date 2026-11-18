import { readJsonResponse } from './jsonResponse.ts';

export async function apiFetch<T>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) window.dispatchEvent(new Event('patriti:unauthorized'));
  return readJsonResponse<T>(response);
}

export async function fetchAuthorizedPdfBlobUrl(
  url: string,
  token: string,
  fallbackError = 'Não foi possível gerar o documento PDF.'
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errorMessage = fallbackError;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) errorMessage = data.error;
    } catch {
      // Ignore
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function fetchMovementPdfBlobUrl(
  movementId: number,
  token: string
): Promise<string> {
  return fetchAuthorizedPdfBlobUrl(
    `/api/movements/${movementId}/term-pdf`,
    token,
    'Não foi possível gerar o Termo de Responsabilidade em PDF.'
  );
}

export async function downloadInventoryExport(
  format: 'csv' | 'pdf',
  filters: {
    search?: string;
    status?: string;
    ownershipType?: string;
    equipmentType?: string;
    departmentId?: string;
  },
  token: string
): Promise<void> {
  const params = new URLSearchParams({ format });
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.status && filters.status !== 'Todos') params.set('status', filters.status);
  if (filters.ownershipType && filters.ownershipType !== 'Todos') {
    params.set('ownershipType', filters.ownershipType);
  }
  if (filters.equipmentType && filters.equipmentType !== 'Todos') {
    params.set('equipmentType', filters.equipmentType);
  }
  if (filters.departmentId && filters.departmentId !== 'Todos') {
    params.set('departmentId', filters.departmentId);
  }

  const response = await fetch(`/api/equipments/export?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errorMessage = 'Não foi possível exportar o inventário.';
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) errorMessage = data.error;
    } catch {
      // Ignore
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `inventario-ti-${dateStamp}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
