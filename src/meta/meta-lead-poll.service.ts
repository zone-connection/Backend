import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaService } from './meta.service';

const DEFAULT_INTERVAL_MS = 120_000;
const FIRST_RUN_DELAY_MS = 20_000;

/**
 * Puxa leads da Graph API enquanto o app Meta está em Development Mode
 * (webhook só chega para quem tem papel no app).
 */
@Injectable()
export class MetaLeadPollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaLeadPollService.name);
  private timer?: ReturnType<typeof setInterval>;
  private firstRun?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly meta: MetaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('META_LEAD_POLL_ENABLED') === 'false') {
      this.logger.log('Poll de leads Meta desligado (META_LEAD_POLL_ENABLED=false).');
      return;
    }

    const interval = Number(
      this.config.get<string>('META_LEAD_POLL_INTERVAL_MS') ?? DEFAULT_INTERVAL_MS,
    );
    const ms =
      Number.isFinite(interval) && interval >= 30_000
        ? interval
        : DEFAULT_INTERVAL_MS;

    this.firstRun = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), ms);
    this.logger.log(`Poll de leads Meta a cada ${Math.round(ms / 1000)}s.`);
  }

  onModuleDestroy() {
    if (this.firstRun) clearTimeout(this.firstRun);
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.meta.syncActiveConnections();
      if (result.created || result.failed) {
        this.logger.log(
          `Poll Meta created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Poll Meta falhou: ${error instanceof Error ? error.message : 'erro'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
