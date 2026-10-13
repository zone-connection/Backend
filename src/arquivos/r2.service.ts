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

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly ttlSeconds: number;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('R2_ENDPOINT')?.trim();
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config
      .get<string>('R2_SECRET_ACCESS_KEY')
      ?.trim();
    this.bucket = this.config.get<string>('R2_BUCKET_NAME')?.trim() ?? '';
    const region = this.config.get<string>('R2_REGION')?.trim() || 'auto';
    this.ttlSeconds = Number(
      this.config.get<string>('R2_SIGNED_URL_TTL_SECONDS') ?? 300,
    );

    if (endpoint && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    } else {
      this.client = null;
      this.logger.warn('R2 não configurado — upload de PDFs indisponível.');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.bucket);
  }

  private requireClient(): S3Client {
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
