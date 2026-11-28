import { UserStatus } from '@prisma/client';
import { nationalPhoneDigits, phonesMatch } from '../common/utils/phone';

type PhoneRow = { telefone?: string | null; whatsapp?: string | null; phone?: string | null };

type PhoneLookup = {
  lead: {
    findMany: (args: {
      where: {
        tenantId: { not: string };
        perdidoAt: null;
        OR: Array<{ telefone: { contains: string } }>;
      };
      select: { telefone: true };
      take: number;
    }) => Promise<Array<{ telefone: string | null }>>;
  };
  user: {
    findMany: (args: {
      where: {
        tenantId: { not: string };
        status: UserStatus;
        OR: Array<
          { whatsapp: { contains: string } } | { phone: { contains: string } }
        >;
      };
      select: { whatsapp: true; phone: true };
      take: number;
    }) => Promise<Array<{ whatsapp: string | null; phone: string | null }>>;
  };
};

/** Dígitos nacionais que já são lead ou colaborador de outra imobiliária. */
export async function phonesOwnedByOtherTenants(
  db: PhoneLookup,
  tenantId: string,
  phones: Array<string | null | undefined>,
): Promise<Set<string>> {
  const owned = new Set<string>();
  const tails = [
    ...new Set(
      phones
        .map((phone) => nationalPhoneDigits(phone ?? ''))
        .filter((digits) => digits.length >= 8)
        .map((digits) => digits.slice(-8)),
    ),
  ];
  if (!tails.length) return owned;

  const [leads, users] = await Promise.all([
    db.lead.findMany({
      where: {
        tenantId: { not: tenantId },
        perdidoAt: null,
        OR: tails.map((tail) => ({ telefone: { contains: tail } })),
      },
      select: { telefone: true },
      take: 300,
    }),
    db.user.findMany({
      where: {
        tenantId: { not: tenantId },
        status: UserStatus.ativo,
        OR: tails.flatMap((tail) => [
          { whatsapp: { contains: tail } },
          { phone: { contains: tail } },
        ]),
      },
      select: { whatsapp: true, phone: true },
      take: 300,
    }),
  ]);

  const foreign: PhoneRow[] = [
    ...leads,
    ...users.flatMap((user) => [
      { telefone: user.whatsapp },
      { telefone: user.phone },
    ]),
  ];
  for (const phone of phones) {
    const digits = nationalPhoneDigits(phone ?? '');
    if (digits.length < 10) continue;
    if (foreign.some((row) => row.telefone && phonesMatch(row.telefone, phone ?? ''))) {
      owned.add(digits);
    }
  }
  return owned;
}
