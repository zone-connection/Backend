import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import * as http from 'http';
import * as https from 'https';
import { isIP } from 'net';
import sharp from 'sharp';

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 16_000_000;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

type ResolvedAddress = { address: string; family: number };

/**
 * Fetches and samples tenant logos without allowing the URL to reach private
 * infrastructure. The selected DNS address is pinned for each request so a
 * hostname cannot pass validation and then be rebound during the connection.
 */
@Injectable()
export class TenantLogoColorService {
  private readonly logger = new Logger(TenantLogoColorService.name);

  async extractPrimaryColor(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;

    let url: URL;
    try {
      url = new URL(logoUrl);
    } catch {
      throw new BadRequestException('logoUrl deve ser uma URL http(s) válida.');
    }
    if (logoUrl.length > 2_048) {
      throw new BadRequestException('logoUrl excede o tamanho máximo permitido.');
    }

    try {
      const image = await this.downloadImage(url);
      return await this.extractDominantSaturatedColor(image);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(
        `Could not derive a primary color from a tenant logo: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  /** Baixa a logo, converte para PNG e extrai a cor predominante (best-effort). */
  async loadLogoForPdf(logoUrl: string | null): Promise<{
    png: Buffer;
    width: number;
    height: number;
    primaryColor: string | null;
  } | null> {
    if (!logoUrl?.trim()) return null;
    let url: URL;
    try {
      url = new URL(logoUrl);
    } catch {
      return null;
    }
    try {
      const image = await this.downloadImage(url);
      const primaryColor = await this.extractDominantSaturatedColor(image);
      const png = await sharp(image, {
        animated: false,
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error',
      })
        .png()
        .toBuffer();
      const meta = await sharp(png).metadata();
      return {
        png,
        width: meta.width ?? 200,
        height: meta.height ?? 80,
        primaryColor,
      };
    } catch (error) {
      this.logger.warn(
        `Could not load tenant logo for PDF: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  private async downloadImage(
    url: URL,
    redirects = 0,
    deadline = Date.now() + REQUEST_TIMEOUT_MS,
  ): Promise<Buffer> {
    const address = await this.resolvePublicAddress(url);
    const response = await this.request(url, address, deadline - Date.now());
    const statusCode = response.statusCode;
    if (statusCode === undefined) {
      response.resume();
      throw new Error('Logo URL returned no HTTP status code.');
    }

    if (
      statusCode >= 300 &&
      statusCode < 400 &&
      response.headers.location
    ) {
      if (redirects >= MAX_REDIRECTS) {
        throw new Error('Logo URL exceeded the redirect limit.');
      }
      response.resume();
      return this.downloadImage(
        new URL(response.headers.location, url),
        redirects + 1,
        deadline,
      );
    }

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Logo URL returned HTTP ${statusCode}.`);
    }

    const contentType = response.headers['content-type']
      ?.split(';', 1)[0]
      .toLowerCase();
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error('Logo URL did not return a supported raster image.');
    }

    const contentLength = Number(response.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error('Logo image exceeds the download limit.');
    }

    return this.readBody(response);
  }

  private async resolvePublicAddress(url: URL): Promise<ResolvedAddress> {
    if (
      url.protocol !== 'http:' &&
      url.protocol !== 'https:'
    ) {
      throw new BadRequestException('logoUrl deve usar http ou https.');
    }
    if (url.username || url.password || url.port && !this.isDefaultPort(url)) {
      throw new BadRequestException(
        'logoUrl não pode conter credenciais ou uma porta não padrão.',
      );
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname === 'localhost') {
      throw new BadRequestException('logoUrl deve apontar para um host público.');
    }

    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await lookup(hostname, { all: true, verbatim: true });
    const publicAddress = addresses.find((entry) => this.isPublicAddress(entry.address));

    if (!publicAddress) {
      throw new BadRequestException('logoUrl deve apontar para um host público.');
    }
    return publicAddress;
  }

  private request(
    url: URL,
    address: ResolvedAddress,
    timeout: number,
  ): Promise<http.IncomingMessage> {
    if (timeout <= 0) {
      return Promise.reject(new Error('Logo request timed out.'));
    }
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const request = client.get(
        url,
        {
          headers: {
            Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
            'User-Agent': 'CRM-NewPalace-LogoAnalyzer/1.0',
          },
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          timeout,
        },
        resolve,
      );
      request.once('timeout', () =>
        request.destroy(new Error('Logo request timed out.')),
      );
      request.once('error', reject);
    });
  }

  private readBody(response: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          response.destroy(new Error('Logo image exceeds the download limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => resolve(Buffer.concat(chunks)));
      response.once('error', reject);
      response.once('aborted', () => reject(new Error('Logo response was aborted.')));
    });
  }

  private async extractDominantSaturatedColor(image: Buffer): Promise<string | null> {
    const { data, info } = await sharp(image, {
      animated: false,
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    })
      .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colors = new Map<string, { weight: number; red: number; green: number; blue: number }>();
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const saturation = max === 0 ? 0 : (max - min) / max;

      // Ignore transparent, grayscale, near-black and near-white pixels.
      if (alpha < 0.5 || saturation < 0.22 || max < 32 || min > 235) continue;

      const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
      const color = colors.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
      const weight = alpha * saturation;
      color.weight += weight;
      color.red += red * weight;
      color.green += green * weight;
      color.blue += blue * weight;
      colors.set(key, color);
    }

    const dominant = [...colors.values()].sort((a, b) => b.weight - a.weight)[0];
    if (!dominant || dominant.weight === 0) return null;

    const toHex = (value: number) =>
      Math.round(value / dominant.weight).toString(16).padStart(2, '0');
    return `#${toHex(dominant.red)}${toHex(dominant.green)}${toHex(dominant.blue)}`.toUpperCase();
  }

  private isDefaultPort(url: URL): boolean {
    return (
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    );
  }

  private isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
      const [a, b] = address.split('.').map(Number);
      return !(
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 0 || b === 168)) ||
        (a === 198 && (b === 18 || b === 19 || b === 51)) ||
        (a === 203 && b === 0) ||
        a >= 224
      );
    }

    const normalized = address.toLowerCase();
    const embeddedIpv4 = this.extractEmbeddedIpv4(normalized);
    if (embeddedIpv4) {
      return this.isPublicAddress(embeddedIpv4);
    }
    return !(
      family !== 6 ||
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('2001:db8') ||
      normalized.startsWith('ff')
    );
  }

  private extractEmbeddedIpv4(address: string): string | null {
    const dotted = address.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return dotted[1];

    const hex = address.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (!hex) return null;
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
