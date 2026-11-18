import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext.tsx';
import { onboardingSchema, type OnboardingInput } from '../shared/validation.ts';
export { LoginScreen } from './SectorLogin.tsx';

export function OnboardingScreen() {
  const { appUser, departments, submitOnboarding, logout } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: appUser?.fullName || '',
      matricula: appUser?.matricula || '',
      jobTitle: appUser?.jobTitle || '',
      departmentId: appUser?.departmentId || departments[0]?.id || 1,
      role: appUser?.role || 'colaborador',
    },
  });

  const onSubmit = async (data: OnboardingInput) => {
    setSubmitError(null);
    try {
      await submitOnboarding(data);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Erro ao finalizar cadastro.'
      );
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Vincular Perfil e Setor
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Defina seu departamento e perfil RBAC para acessar o inventário e o canal WebSocket.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap cursor-pointer"
          >
            Sair
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {submitError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {submitError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Nome Completo *
            </label>
            <input
              {...register('fullName')}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              placeholder="Ex: Marcos Felipe Sirgueira"
            />
            {errors.fullName && (
              <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Matrícula / CPF Funcional *
              </label>
              <input
                {...register('matricula')}
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                placeholder="Ex: MAT-1042"
              />
              {errors.matricula && (
                <p className="mt-1 text-xs text-red-600">{errors.matricula.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Cargo *
              </label>
              <input
                {...register('jobTitle')}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                placeholder="Ex: Analista de Infraestrutura"
              />
              {errors.jobTitle && (
                <p className="mt-1 text-xs text-red-600">{errors.jobTitle.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Setor / Departamento *
              </label>
              <select
                {...register('departmentId', { valueAsNumber: true })}
                disabled
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.code} · {dept.name}
                  </option>
                ))}
              </select>
              {errors.departmentId && (
                <p className="mt-1 text-xs text-red-600">{errors.departmentId.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Perfil de Acesso (RBAC) *
              </label>
              <select
                {...register('role')}
                disabled
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              >
                <option value="admin_ti">Admin / Técnico de TI</option>
                <option value="colaborador">Colaborador / Setor</option>
              </select>
              {errors.role && (
                <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>
              )}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              {isSubmitting ? 'Salvando...' : 'Concluir Vinculação e Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
