# Webhooks da API v1

O parceiro cadastra destinos com o escopo `webhooks:manage`. O Tenant e a aplicação vêm do token.

## Endpoints

- `POST /api/v1/webhooks` cria o destino e devolve o segredo uma única vez.
- `GET /api/v1/webhooks` lista os destinos da aplicação autenticada.
- `GET /api/v1/webhooks/:id` consulta um destino. Outra aplicação ou outro Tenant recebe 404.
- `PATCH /api/v1/webhooks/:id` altera URL, eventos ou `active`.
- `DELETE /api/v1/webhooks/:id` desativa o destino e cancela entregas pendentes. O histórico permanece.
- `POST /api/v1/webhooks/:id/rotate-secret` troca o segredo. Entregas ainda não enviadas usam o segredo vigente no momento do envio.

## Eventos

`lead.created`, `lead.updated`, `lead.stage_changed`, `property.available`, `property.unavailable`, `property.updated`.

Imóveis usam `VendaUsado.id` e somente a transição real de `status = disponivel`. Captação e empreendimento não geram esses eventos.

## Payload

```json
{
  "id": "evento-uuid",
  "name": "lead.created",
  "occurredAt": "2026-11-07T16:00:00.000Z",
  "data": { "resourceId": "recurso-uuid", "resourceType": "lead" }
}
```

O detalhe é consultado em `GET /api/v1/leads/:id` ou `GET /api/v1/properties/:id`.

## Assinatura

Headers: `X-Zone-Event-Id`, `X-Zone-Event`, `X-Zone-Timestamp`, `X-Zone-Signature`.

`X-Zone-Signature` é `sha256=` mais o HMAC-SHA256 do segredo sobre `timestamp + "." + rawBody`, usando os bytes enviados.

```js
const crypto = require('crypto');
const esperado = 'sha256=' + crypto.createHmac('sha256', segredo).update(timestamp + '.' + rawBody).digest('hex');
```

A entrega é pelo menos uma vez. O parceiro deduplica por `id` ou `X-Zone-Event-Id`.

A conexão usa o IP validado na resolução. O TLS continua verificando o certificado pelo hostname original. Enquanto `reservadoAte` estiver no futuro, outro worker não pega a mesma entrega. Se o processo cair, o lease expira e a entrega volta à fila.

## Retentativas

Sucesso é HTTP 2xx. 408, 429, 5xx, timeout e falha de rede são retentados. Os demais 4xx encerram a entrega. Intervalos base: imediato, 1 min, 5 min, 15 min, 1 h, 6 h, com limite de 6 tentativas. Cada tentativa fica em `api_webhook_tentativas`.

## Variáveis

- `WEBHOOK_ENCRYPTION_KEY`: 32 bytes em base64, exclusiva deste ambiente.
- `WEBHOOK_HTTP_TIMEOUT_MS`: padrão 5000.
- `WEBHOOK_WORKER_INTERVAL_MS`: padrão 5000.
- `WEBHOOK_WORKER=0` desliga o worker.
- `WEBHOOK_ALLOW_HTTP=true` só vale com `NODE_ENV=test`.
