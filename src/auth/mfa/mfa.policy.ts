import { MfaDecision, Role } from '@prisma/client';

export type MfaPolicyLevel = 'obrigatoria' | 'escolha' | 'voluntaria';

export type MfaGate =
  | 'codigo'
  | 'configurar'
  | 'decidir'
  | null;

export function mfaPolicyForRole(role: Role): MfaPolicyLevel {
  if (role === Role.super_admin) return 'obrigatoria';
  if (role === Role.admin) return 'escolha';
  return 'voluntaria';
}

export function mfaGateFor(input: {
  role: Role;
  totpEnabledAt: Date | null;
  mfaDecision: MfaDecision | null;
}): MfaGate {
  if (input.totpEnabledAt) return 'codigo';
  const policy = mfaPolicyForRole(input.role);
  if (policy === 'obrigatoria') return 'configurar';
  if (policy === 'escolha' && input.mfaDecision == null) return 'decidir';
  if (policy === 'escolha' && input.mfaDecision === MfaDecision.manter) {
    return 'configurar';
  }
  return null;
}

export function canDisableMfa(role: Role): boolean {
  return role !== Role.super_admin;
}
