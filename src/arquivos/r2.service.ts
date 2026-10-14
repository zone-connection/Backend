import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

function sanitizeR2Secret(value: string | undefined): string {
  return (value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly ttlSeconds: number;
  private readonly credentialError: string | null;

  constructor(private readonly config: ConfigService) {
    const endpoint = sanitizeR2Secret(this.config.get<string>('R2_ENDPOINT'));
    const accessKeyId = sanitizeR2Secret(
      this.config.get<string>('R2_ACCESS_KEY_ID'),
    );
    const secretAccessKey = sanitizeR2Secret(
      this.config.get<string>('R2_SECRET_ACCESS_KEY'),
    );
    this.bucket = sanitizeR2Secret(this.config.get<string>('R2_BUCKET_NAME'));
    const region =
      sanitizeR2Secret(this.config.get<string>('R2_REGION')) || 'auto';
    this.ttlSeconds = Number(
      this.config.get<string>('R2_SIGNED_URL_TTL_SECONDS') ?? 300,
    );

    this.credentialError = null;
    if (accessKeyId && accessKeyId.length !== 32) {
      this.credentialError = `R2_ACCESS_KEY_ID tem ${accessKeyId.length} caracteres; o Cloudflare R2 exige 32. Recrie o token em R2 → Manage R2 API Tokens e cole de novo no Dokploy, sem espaço nem aspas.`;
      this.logger.error(this.credentialError);
    }

    if (
      endpoint &&
      accessKeyId &&
      secretAccessKey &&
      this.bucket &&
      !this.credentialError
    ) {
      this.client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    } else {
      this.client = null;
      if (!this.credentialError) {
        this.logger.warn('R2 não configurado — upload de PDFs indisponível.');
      }
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.bucket);
  }

  private requireClient(): S3Client {
    if (this.credentialError) {
      throw new ServiceUnavailableException(
        'O armazenamento de PDFs está com a chave R2 inválida. No Dokploy, confira R2_ACCESS_KEY_ID (deve ter 32 caracteres).',
      );
    }
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Armazenamento de arquivos não está configurado.',
      );
    }
    return this.client;
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    await this.requireClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await this.requireClient().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = result.Body;
    if (!stream) {
      throw new ServiceUnavailableException('Arquivo vazio no armazenamento.');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async signedGetUrl(key: string, filename: string): Promise<string> {
    const ttl = Number.isFinite(this.ttlSeconds) ? this.ttlSeconds : 300;
    return getSignedUrl(
      this.requireClient(),
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, '')}"`,
        ResponseContentType: 'application/pdf',
      }),
      { expiresIn: Math.max(60, ttl) },
    );
  }

  async deleteObject(key: string) {
    try {
      await this.requireClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao remover objeto R2: ${error instanceof Error ? error.message : 'erro'}`,
      );
    }
  }
}
