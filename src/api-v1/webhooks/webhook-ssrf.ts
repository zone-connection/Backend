import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';

type LookupFn = (host: string) => Promise<string[]>;

const BLOQUEADOS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
  /^::$/,
];

export function ipPrivado(ip: string) {
  const normalizado = ip.toLowerCase().replace(/^::ffff:/, '');
  return BLOQUEADOS.some((regra) => regra.test(normalizado));
}

export async function validarUrlWebhook(
  valor: string,
  opcoes?: { allowHttp?: boolean; allowLoopback?: boolean; lookup?: LookupFn },
) {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('URL inválida.');
  }
  const https = url.protocol === 'https:';
  const httpTeste = opcoes?.allowHttp === true && url.protocol === 'http:';
  if (!https && !httpTeste) throw new Error('A URL do webhook precisa ser HTTPS.');
  if (url.username || url.password) throw new Error('URL com credencial não é aceita.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopbackPermitido = opcoes?.allowLoopback === true;
  if ((host === 'localhost' || host.endsWith('.localhost')) && !loopbackPermitido) {
    throw new Error('Destino local não é aceito.');
  }
  const literais = isIP(host) ? [host] : [];
  const resolvidos = literais.length
    ? literais
    : await (opcoes?.lookup ?? resolver)(host);
  if (resolvidos.length === 0) throw new Error('O destino não resolve em DNS.');
  const privado = resolvidos.some((ip) => ipPrivado(ip));
  const somenteLoopback = resolvidos.every((ip) => ip === '127.0.0.1' || ip === '::1');
  if (privado && !(loopbackPermitido && somenteLoopback)) {
    throw new Error('O destino aponta para uma rede privada.');
  }
  return url.toString();
}

export async function destinoFixado(
  valor: string,
  opcoes?: { allowHttp?: boolean; allowLoopback?: boolean; lookup?: LookupFn },
) {
  const href = await validarUrlWebhook(valor, opcoes);
  const url = new URL(href);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const enderecos = isIP(host) ? [host] : await (opcoes?.lookup ?? resolver)(host);
  const address = enderecos[0];
  if (!address) throw new Error('O destino não resolve em DNS.');
  return {
    href,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: `${url.pathname}${url.search}`,
    address,
    family: address.includes(':') ? 6 : 4,
  };
}

async function resolver(host: string) {
  const registros = await dnsLookup(host, { all: true, verbatim: true });
  return registros.map((item) => item.address);
}
