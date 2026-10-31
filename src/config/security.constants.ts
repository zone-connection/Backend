/** Parâmetros de proteção contra força bruta e abuso da API. */

/** Custo do bcrypt. 12 ≈ 250ms por hash — inviabiliza cracking em massa. */
export const SALT_ROUNDS = 12;

/** Falhas consecutivas (por e-mail) até bloquear temporariamente o acesso. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Janela usada para contar as falhas recentes. */
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Duração do bloqueio depois de estourar o limite. */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** Falhas no dia (por e-mail) até o bloqueio longo. */
export const DAILY_MAX_FAILED_LOGIN_ATTEMPTS = 15;

/** Janela em que as falhas do bloqueio longo são contadas. */
export const DAILY_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Duração do bloqueio depois de estourar o limite diário. */
export const DAILY_LOCKOUT_DURATION_MS = 12 * 60 * 60 * 1000;

/** Validade do token de recuperação de senha. */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** Limites de requisições por IP (rate limiting). */
export const THROTTLE = {
  /** Padrão aplicado a toda a API. */
  global: { ttl: 60_000, limit: 120 },
  /** Login: tolera erro de digitação, mas mata força bruta. */
  login: { ttl: 60_000, limit: 5 },
  /** Renovação de sessão. */
  refresh: { ttl: 60_000, limit: 20 },
  /** Recuperação de senha: evita spam de e-mail e sondagem de contas. */
  forgotPassword: { ttl: 15 * 60_000, limit: 3 },
  /** Troca de senha autenticada. */
  changePassword: { ttl: 60_000, limit: 5 },
} as const;

/**
 * Exigência mínima de senha: 8+ caracteres com minúscula, maiúscula e número.
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const PASSWORD_RULE_MESSAGE =
  'A senha deve ter ao menos 8 caracteres, incluindo maiúscula, minúscula e número.';
