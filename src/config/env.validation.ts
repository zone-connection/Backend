/**
 * Validação das variáveis de ambiente no boot.
 * A aplicação não sobe com segredos ausentes, curtos ou com os valores
 * de exemplo — evita ir para produção com chave JWT previsível.
 */

const MIN_SECRET_LENGTH = 32;

const FORBIDDEN_IN_PRODUCTION = [
  'dev-access-secret-newpalace-change-me',
  'dev-refresh-secret-newpalace-change-me',
  'troque-por-um-segredo-forte-de-acesso',
  'troque-por-um-segredo-forte-de-refresh',
];

export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];
  const isProd = config.NODE_ENV === 'production';

  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of required) {
    if (!config[key]) {
      errors.push(`${key} é obrigatório.`);
    }
  }

  const accessSecret = String(config.JWT_ACCESS_SECRET ?? '');
  const refreshSecret = String(config.JWT_REFRESH_SECRET ?? '');
  const ozapWebhookSecret = String(config.OZAP_WEBHOOK_SECRET ?? '');
  const metaAppSecret = String(config.META_APP_SECRET ?? '');
  const metaVerifyToken = String(config.META_VERIFY_TOKEN ?? '');

  for (const [key, secret] of [
    ['JWT_ACCESS_SECRET', accessSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      errors.push(
        `${key} deve ter ao menos ${MIN_SECRET_LENGTH} caracteres (atual: ${secret.length}).`,
      );
    }
    if (isProd && FORBIDDEN_IN_PRODUCTION.includes(secret)) {
      errors.push(`${key} está usando o valor de exemplo — gere um segredo novo.`);
    }
  }

  if (accessSecret && accessSecret === refreshSecret) {
    errors.push(
      'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes: com segredos iguais, um access token vale como refresh token.',
    );
  }

  if (
    ozapWebhookSecret &&
    ozapWebhookSecret.length < MIN_SECRET_LENGTH
  ) {
    errors.push(
      `OZAP_WEBHOOK_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`,
    );
  }

  if (metaAppSecret && metaAppSecret.length < 16) {
    errors.push('META_APP_SECRET parece inválido (muito curto).');
  }

  if (metaVerifyToken && metaVerifyToken.length < 8) {
    errors.push(
      'META_VERIFY_TOKEN deve ter ao menos 8 caracteres.',
    );
  }

  const metaConfigured = Boolean(
    config.META_APP_SECRET || config.META_VERIFY_TOKEN,
  );
  if (metaConfigured) {
    for (const key of ['META_APP_SECRET', 'META_VERIFY_TOKEN'] as const) {
      if (!config[key]) {
        errors.push(
          `${key} é obrigatório quando a integração Meta está parcialmente configurada.`,
        );
      }
    }
  }

  const cloudinaryName = String(config.CLOUDINARY_CLOUD_NAME ?? '').trim();
  const cloudinaryKey = String(config.CLOUDINARY_API_KEY ?? '').trim();
  const cloudinarySecret = String(config.CLOUDINARY_API_SECRET ?? '').trim();
  const cloudinaryPartial =
    Boolean(cloudinaryName || cloudinaryKey || cloudinarySecret) &&
    !(cloudinaryName && cloudinaryKey && cloudinarySecret);
  if (cloudinaryPartial) {
    errors.push(
      'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET devem ser definidos juntos.',
    );
  }

  if (isProd && !config.FRONTEND_URL) {
    errors.push('FRONTEND_URL é obrigatório em produção (define o CORS).');
  }

  // Admin de sistema: recomendado em production, mas não derruba o boot
  // (permite subir o serviço e configurar as vars no painel depois).
  if (
    isProd &&
    (!config.BOOTSTRAP_ADMIN_EMAIL || !config.BOOTSTRAP_ADMIN_PASSWORD)
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD ausentes — admin de sistema não será criado no boot.',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuração de ambiente inválida:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
