import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebhookEntregaService } from './webhooks.service';

@Injectable()
export class WebhookWorkerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly entregas: WebhookEntregaService) {}

  onModuleInit() {
    if (process.env.WEBHOOK_WORKER === '0') return;
    const intervalo = Number(process.env.WEBHOOK_WORKER_INTERVAL_MS ?? 5000);
    this.timer = setInterval(() => {
      void this.ciclo();
    }, intervalo);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async ciclo() {
    try {
      await this.entregas.publicarEventosPendentes();
      await this.entregas.processarEntregas();
    } catch {
      // Falha de um ciclo não derruba o processo. O próximo intervalo retoma.
    }
  }
}
