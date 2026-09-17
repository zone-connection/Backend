-- Avisos de lead atribuído ao corretor e de lead no pool (sem dono).
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'lead_atribuido';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'lead_pool';
