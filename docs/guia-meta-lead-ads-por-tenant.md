# Guia: Meta Lead Ads por imobiliária (tenant)

Use este guia para ligar o Facebook Ads de **cada cliente** ao CRM da Zone Connection.  
Não cole tokens, App Secret nem senhas em chat, e-mail ou print.

---

## Ideia em uma frase

**Um app só (o da plataforma). Uma Página Facebook por imobiliária. O CRM roteia o lead pelo Page ID.**

A campanha **não** escolhe o tenant. Ela escolhe a **Página**.  
Página da Silva → tenant da Silva. Página da Zone Connection → tenant da Zone Connection.

---

## O que já existe (não refazer)

Isso é **único** para a plataforma. Não criar de novo para cada cliente.

| Item | Valor / onde |
| --- | --- |
| App Meta | **Aplicativo ZoneConnection** — App ID `1079705831674949` |
| Webhook | `https://SEU-DOMINIO-DA-API/api/webhooks/meta` (objeto **Page**, campo **leadgen**) |
| App Secret + verify token | Variáveis no Dokploy (`META_APP_SECRET`, `META_VERIFY_TOKEN`) |
| App Review / publicar o app | Uma vez, quando a empresa estiver verificada. Vale para **todas** as Páginas ligadas |

**Não** crie outro app Meta para o cliente.

Enquanto o app estiver **não publicado**, lead de gente de fora **não chega pelo webhook**. A API **puxa** os leads da Graph a cada ~2 min, com o token da Página. Quando o app estiver Live, o webhook avisa na hora — o roteamento por Page ID continua o mesmo.

---

## Checklist por imobiliária

Faça nesta ordem:

1. Tenant criado no CRM (nome da imobiliária).
2. Página do Facebook **dela** (criar só se ainda não tiver).
3. Page ID anotado.
4. Token **da Página** de longa duração gerado.
5. Página inscrita no app ZoneConnection (`leadgen`).
6. Page ID + token colados em **Tenants → [cliente] → Meta Lead Ads**.
7. Campanha de Lead Ads no Gerenciador, identidade = **essa** Página.
8. Teste: preencher o formulário e conferir **Leads → Chegaram** no tenant certo.

---

## 1. Tenant no CRM

1. Entre como super admin da plataforma.
2. **Tenants** → crie a imobiliária (se ainda não existir).
3. Abra **Conexões** desse tenant. Deixe a aba **Meta Lead Ads** pronta para o passo 6.

O lead só aparece quando você estiver logado **nesse** tenant (ou vendo os leads dele). Página ligada no tenant A não aparece na lista do tenant B.

---

## 2. Página do Facebook

### A imobiliária já tem Página

Não crie outra. Use a Página da marca dela.  
Peça que um **administrador da Página** autorize o token (passo 4).

### A imobiliária não tem Página

1. Facebook com a conta que vai administrar (ideal: da imobiliária / portfólio dela).
2. Abra [facebook.com/pages/create](https://www.facebook.com/pages/create).
3. Tipo: negócio / empresa. Nome = nome da imobiliária. Categoria: **Imobiliária**.
4. Crie a Página.

**Não** use a Página **Zone Connection** para anúncio de cliente. Tudo cairia no tenant que tem o Page ID da Zone Connection.

---

## 3. Descobrir o Page ID

Opção A — na Página (computador):

1. Abra a Página.
2. **Configurações** → **Sobre** / transparência da Página.
3. Copie o **ID da Página** (só números).

Opção B — Graph API Explorer ([developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)):

1. App: **Aplicativo ZoneConnection**.
2. Token da Página (depois do passo 4) no campo Token de acesso.
3. GET:

```text
me?fields=id,name
```

O `id` é o Page ID. Anote. É o que vai no CRM.

---

## 4. Token da Página (o que vai no CRM)

O token do botão **Generate Access Token** do Explorer é **curto** (1–2 horas). Não deixe esse no tenant.

### 4.1 Token curto (usuário)

1. Explorer → App **Aplicativo ZoneConnection**.
2. **Não** use “Token do aplicativo”.
3. **Generate Access Token**, com pelo menos:
   - `pages_show_list`
   - `pages_manage_metadata`
   - `leads_retrieval`
   - `business_management`
4. Autorize como admin da **Página do cliente**.
5. Esse valor é o **token curto**.

`me/accounts` pode voltar vazio. Use o portfólio de negócios.

GET:

```text
me/businesses
```

Anote o `id` do portfólio que **é dono da Página do cliente**.

### 4.2 Trocar por token de 60 dias (usuário)

GET (no Explorer, ainda com o token curto):

```text
oauth/access_token?grant_type=fb_exchange_token&client_id=1079705831674949&client_secret=APP_SECRET&fb_exchange_token=TOKEN_CURTO
```

- `APP_SECRET`: Configurações do app → Básico → Chave secreta do app (só nessa URL).
- `TOKEN_CURTO`: o token do passo 4.1.

Resposta esperada:

```json
{
  "access_token": "…",
  "token_type": "bearer",
  "expires_in": 5184000
}
```

`5184000` = 60 dias. Esse `access_token` ainda é **de usuário**. **Não** cole no CRM.

### 4.3 Token da Página (esse vai no CRM)

1. Cole o token de 60 dias no campo **Token de acesso** do Explorer.
2. GET (troque `ID_DO_PORTFOLIO` pelo id de `me/businesses`):

```text
ID_DO_PORTFOLIO/owned_pages?fields=id,name,access_token
```

3. Ache a Página da imobiliária.
4. Copie o `access_token` **dela**. Esse é o token da Página.

Token da Página gerado a partir do token de 60 dias em geral **não expira**, salvo senha trocada, app revogado ou App Secret alterado.

Se o token morrer, o log da API mostra falha OAuth / token inválido. Gere de novo (passos 4.1–4.3) e **atualize** o token no tenant. Não precisa criar app nem Página de novo.

---

## 5. Inscrever a Página no app da plataforma

Ainda no Explorer, token **da Página** no campo Token de acesso.

GET:

```text
PAGE_ID/subscribed_apps
```

Tem que aparecer o app `1079705831674949` com `leadgen`.

Se não aparecer, POST:

```text
PAGE_ID/subscribed_apps?subscribed_fields=leadgen
```

Resposta: `"success": true`.

Faça isso **em cada Página nova**. O webhook do app já está configurado; o que falta é a Página “avisar” esse app.

---

## 6. Vincular no CRM

1. **Tenants** → a imobiliária → **Conexões** → **Meta Lead Ads**.
2. **Page ID**: o número do passo 3.
3. **Page Access Token**: o token da Página do passo 4.3.
4. **Add**. Status **Ativa**.

O mesmo Page ID **não** pode estar em dois tenants.

---

## 7. Campanha de anúncio nessa Página

O anúncio não aponta para o tenant. Ele aponta para a **Página**.

1. [Gerenciador de Anúncios](https://www.facebook.com/adsmanager) da **conta de anúncios dessa imobiliária** (precisa ter permissão na Página).
2. **Criar** campanha.
3. Objetivo: **Captar leads** / Lead ads (formulário instantâneo).
4. No conjunto de anúncios, **Identidade** = a Página do cliente (não a Zone Connection).
5. Formulário instantâneo **dessa** mesma Página.
6. Publique.

Quem preenche o form gera lead na Meta com o `page_id` dessa Página. O CRM grava no tenant que tem esse Page ID.

---

## 8. Conferir se chegou

1. Preencha o formulário (prévia do form ou anúncio real).
2. No CRM, entre no **tenant daquela imobiliária**.
3. **Leads → Chegaram**, origem **Facebook Ads**.

No Dokploy → app da API → **Logs**, busque `MetaService` ou `Importando lead da Graph`.

| Log | Significado |
| --- | --- |
| `leadgen_id=444444444444` | Ping dummy da Meta. Não é lead de campanha. |
| `Importando lead da Graph` / `Poll Meta created=` | Puxada pela Graph (app ainda não Live). |
| `page_id=` com o ID real da Página do cliente | Evento da Página certa. |
| Token inválido / OAuth | Atualizar o token da Página no tenant. |

Para ver se a Meta gravou o lead, no Explorer (token da Página):

```text
PAGE_ID/leadgen_forms?fields=id,name,status
FORM_ID/leads?fields=id,created_time,field_data
```

Se o lead está na Meta e não no CRM: conferir tenant, Page ID, token ativo e logs.

---

## O que não fazer

- Criar um **app Meta novo** por cliente.
- Anunciar na Página **Zone Connection** para gerar lead de outro tenant.
- Colocar no CRM o token **curto** ou o token de **usuário** de 60 dias. Só o token da **Página**.
- Ligar a mesma Página em dois tenants.
- Colar token em print, chat ou e-mail.

---

## Resumo rápido (colar no onboarding)

```text
1. Tenant da imobiliária no CRM
2. Página Facebook DELA (criar só se não existir)
3. Anotar Page ID
4. Token curto → token 60 dias → token da Página
5. PAGE_ID/subscribed_apps?subscribed_fields=leadgen
6. Tenants → cliente → Meta Lead Ads → Page ID + token da Página
7. Campanha Lead Ads com Identidade = essa Página
8. Conferir Leads → Chegaram nesse tenant
```
