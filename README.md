# Plataforma de Agendamentos (multi-tenant)

Sistema de gestão de múltiplas agendas (profissionais), com dashboard em grupo e individual,
controle de acesso por cargo (admin/secretária vs profissional) e API pronta para integração com N8N.

**Multi-tenant desde a raiz:** o mesmo código/deploy atende diversos clientes (uma barbearia,
uma clínica, um estúdio de estética...), cada um em seu próprio "tenant", com dados 100% isolados.
Cada cliente acessa pelo **próprio subdomínio** (ex.: `barbearia-do-ze.seuapp.com`), que já aplica
o branding dele (nome, cor) na tela de login e restringe o acesso apenas aos usuários daquele tenant.

## Stack

- **Next.js 14 (App Router)** — frontend + API routes no mesmo projeto
- **Prisma + PostgreSQL** (compatível com Supabase)
- **NextAuth (Credentials)** — autenticação com sessão JWT, roles e tenant
- **Tailwind CSS**

## Como funciona o multi-tenant

- Todo dado (`User`, `Professional`, `Appointment`, `ApiKey`...) pertence a um `Tenant` via `tenantId`.
  Toda query no código filtra por `tenantId` — é a regra de ouro pra nunca vazar dado entre clientes.
- **Identificação por subdomínio:** o `middleware.ts` lê o `Host` da requisição e extrai o subdomínio
  (`lib/tenant.ts` → `extractTenantSlug`). Ex.: `barbearia-do-ze.seuapp.com` → slug `barbearia-do-ze`.
  Esse slug é repassado como header `x-tenant-slug` para toda página/rota.
- **Login restrito ao subdomínio:** em `lib/auth.ts`, o `authorize` do NextAuth lê o subdomínio a
  partir do próprio `request` e só considera usuários daquele tenant. Ou seja, mesmo que alguém tenha
  o email/senha corretos de um cliente, eles não funcionam no subdomínio de outro — dupla proteção,
  além do isolamento por `tenantId` nas queries.
- **Branding automático:** a tela de login (`app/login/page.tsx`) busca o `Tenant` pelo subdomínio e
  aplica o nome e a cor (`primaryColor`) dele automaticamente.
- **Terminologia por tipo de negócio:** o campo `businessType` do `Tenant` (BARBEARIA, CLINICA,
  ESTETICA, OUTRO) define os rótulos padrão da interface via `lib/labels.ts` — "Profissional" vira
  "Barbeiro", "Consulta" vira "Corte", "Paciente" vira "Cliente", etc. Quer um termo bem específico
  pra um cliente só? Sobrescreva via `customLabels` (JSON) no `Tenant`, sem precisar de código novo.
- **Campos específicos por negócio:** em vez de criar tabelas diferentes pra cada vertical, use os
  campos `customFields` (JSON) em `Professional` e `Appointment` — ex: `{"comissaoPercentual": 40}`
  numa barbearia, `{"convenio": "Unimed"}` numa clínica.
- **N8N por tenant:** cada tenant tem sua própria `ApiKey`. A automação do cliente A nunca acessa,
  nem sem querer, os dados do cliente B — a chave já resolve o `tenantId` na validação, independente
  de subdomínio (o N8N chama a API diretamente, sem passar pelo browser).

### Cadastrando um novo cliente (novo tenant)

Existe uma tela pra isso: acesse `/admin` logado como `SUPER_ADMIN` (pelo domínio raiz, sem
subdomínio — ex: `http://localhost:3000/admin` ou `http://seudominio.com/admin` em produção).
Lá você vê todos os clientes cadastrados e tem um botão **"+ Novo cliente"** que abre um formulário
com: nome do negócio, subdomínio, tipo de negócio, cor de identidade, e o login inicial
(nome/email/senha) que a secretária/dono daquele negócio vai usar pra entrar pela primeira vez.

Ao criar, a tela mostra **uma única vez** a API key do N8N gerada pra esse cliente — copie e guarde
nesse momento, ela não fica visível depois (só o hash dela é salvo no banco, por segurança).

O seed já cria seu usuário `SUPER_ADMIN` de teste (veja a seção de credenciais abaixo).

## Setup

```bash
npm install

cp .env.example .env
# Preencha DATABASE_URL (Supabase ou Postgres self-hosted) e AUTH_SECRET
# NEXT_PUBLIC_ROOT_DOMAIN já vem configurado como "lvh.me" para testar
# subdomínios em localhost sem mexer no /etc/hosts (lvh.me resolve pra 127.0.0.1)

npx prisma generate
npx prisma migrate dev --name init

npm run db:seed   # cria 2 tenants de exemplo (clínica + barbearia), cada um com
                   # admin, profissionais e API key do N8N
# >>> ANOTE as API keys impressas no terminal - elas só aparecem uma vez!

npm run dev
```

**Acesse cada tenant pelo próprio subdomínio:**
- `http://clinica-saude-total.lvh.me:3000/login`
- `http://barbearia-do-ze.lvh.me:3000/login`

Repare que cada subdomínio já mostra o nome do negócio e a cor certa na tela de login, e que
logar com as credenciais de um tenant no subdomínio do outro simplesmente não funciona.

**Credenciais de teste (o seed cria 2 tenants isolados + você como dono da plataforma):**

| Tenant / subdomínio | Papel | Email | Senha |
|---|---|---|---|
| (nenhum - domínio raiz) | **SUPER_ADMIN** (você) | voce@suaplataforma.com | superadmin123 |
| clinica-saude-total | Admin/Secretária | secretaria@saudetotal.com | admin123 |
| clinica-saude-total | Profissional | ana@saudetotal.com | profissional123 |
| barbearia-do-ze | Admin/Recepção | recepcao@barbeariadoze.com | admin123 |
| barbearia-do-ze | Profissional | ze@barbeariadoze.com | profissional123 |

Acesse `http://localhost:3000/login` (sem subdomínio) com o login SUPER_ADMIN pra cair em `/admin`
e criar/ver os clientes da plataforma.

**Troque a senha do SUPER_ADMIN antes de ir pra produção** — ela vem hardcoded no `prisma/seed.ts`
só pra facilitar o teste local.

Ao logar em `clinica-saude-total.lvh.me:3000` como `secretaria@saudetotal.com`, você só vê os
profissionais daquele tenant, com "Profissional"/"Consulta"/"Paciente" na tela. Em
`barbearia-do-ze.lvh.me:3000`, com `recepcao@barbeariadoze.com`, aparece "Barbeiro"/"Corte"/"Cliente".

**Em produção:** aponte um DNS wildcard `*.seudominio.com` para o seu deploy (a maioria dos
provedores — Vercel, Cloudflare etc. — suporta isso direto) e defina
`NEXT_PUBLIC_ROOT_DOMAIN=seudominio.com`. Todo subdomínio passa a funcionar automaticamente,
sem precisar configurar nada por cliente novo.

## Modelo de permissões

Duas camadas, sempre nessa ordem:

1. **Isolamento por tenant** — o profissional/agendamento precisa pertencer ao mesmo `tenantId` do
   usuário logado. Isso é absoluto: nem um ADMIN vê dado de outro tenant.
2. **Papel dentro do tenant**:
   - **ADMIN** (secretária/gestão): acessa `/dashboard` (visão geral de todos os profissionais do seu
     tenant) e qualquer `/dashboard/[professionalId]` desse mesmo tenant.
   - **PROFESSIONAL**: ao acessar `/dashboard`, é redirecionado automaticamente para sua própria
     agenda em `/dashboard/[professionalId]`. Tentativas de acessar a agenda de outro profissional
     (mesmo do mesmo tenant) são bloqueadas tanto na página quanto na API (`/api/appointments`).

Isso é controlado pelo campo `role` + `tenantId` no model `User` e pela função
`canAccessProfessional` em `lib/auth.ts`.

Para cadastrar novos profissionais/usuários, crie uma tela de administração (CRUD sobre `User` +
`Professional`) ou insira diretamente via Prisma Studio (`npx prisma studio`) enquanto o admin painel
não é construído.

## Integração com N8N

Todas as rotas abaixo exigem o header `x-api-key`. **Cada tenant tem sua própria chave** (gerada no
seed ou via `lib/apiKeyAuth.ts`) — configure um workflow/credencial separado no N8N pra cada cliente
que você atender, usando o node **HTTP Request** com um header `x-api-key: <chave-daquele-tenant>`.
A chave já resolve o tenant internamente, então o mesmo endpoint serve todos os seus clientes sem
risco de misturar dados.

### 1. Listar os serviços que um profissional realiza

```
GET /api/n8n/services?professionalId=<id>
```

Resposta:
```json
{
  "professionalId": "...",
  "services": [
    { "serviceId": "...", "name": "Corte", "durationMin": 30, "price": 40 },
    { "serviceId": "...", "name": "Corte + barba", "durationMin": 60, "price": 70 }
  ]
}
```

Use isso pra oferecer as opções ao paciente/cliente ANTES de checar horários — a duração e o preço
já vêm resolvidos (com o override do profissional se houver, senão o padrão do catálogo do tenant).

### 2. Consultar horários de início disponíveis para um serviço

```
GET /api/n8n/availability?professionalId=<id>&serviceId=<id>&date=2026-07-25
```

Resposta:
```json
{
  "professionalId": "...",
  "serviceId": "...",
  "date": "2026-07-25",
  "durationMin": 60,
  "availableStartTimes": [
    "2026-07-25T11:00:00.000Z",
    "2026-07-25T11:15:00.000Z"
  ]
}
```

A duração do serviço já entra no cálculo: um serviço de 1h só aparece com horários de início que
cabem inteiros num espaço livre da agenda, enquanto um de 30min aparece com mais opções no mesmo
espaço. Não existe mais "grade fixa" — cada serviço enxerga a agenda do seu próprio tamanho.

### 3. Criar agendamento

```
POST /api/n8n/appointments
Content-Type: application/json

{
  "professionalId": "...",
  "serviceId": "...",
  "patientName": "João da Silva",
  "patientPhone": "+55 41 99999-0000",
  "startAt": "2026-07-25T11:00:00.000Z",
  "externalRef": "whatsapp-conversa-123"
}
```

Use um `startAt` retornado pela consulta de disponibilidade — a duração vem sempre do `serviceId`
(nunca do que o N8N informar diretamente), o que evita agendamentos com duração errada por engano
no fluxo. A rota revalida a disponibilidade no momento da criação (retorna `409` se o horário já
tiver sido ocupado entre a consulta e a criação — útil para evitar conflitos em fluxos concorrentes).

### 4. Cancelar agendamento

```
PATCH /api/n8n/appointments
Content-Type: application/json

{
  "externalRef": "whatsapp-conversa-123",
  "reason": "Paciente remarcou"
}
```

Pode cancelar por `appointmentId` (id interno) ou `externalRef` (id da conversa/pedido externo,
útil quando o paciente cancela pelo WhatsApp e o N8N só tem esse identificador).

### Exemplo de fluxo típico no N8N

1. Webhook recebe mensagem do paciente (WhatsApp/chatbot)
2. HTTP Request → `GET /api/n8n/services` para saber quais serviços aquele profissional oferece
3. Chatbot pergunta qual serviço o paciente quer
4. HTTP Request → `GET /api/n8n/availability` (com o `serviceId` escolhido) para listar horários livres
5. Chatbot envia as opções ao paciente
6. Paciente escolhe → HTTP Request → `POST /api/n8n/appointments`
7. (Opcional) Node de espera + HTTP Request → lembrete automático X horas antes
8. Se o paciente cancelar → HTTP Request → `PATCH /api/n8n/appointments`

## Estrutura do banco (resumo)

- `Tenant` — cada cliente da plataforma (barbearia, clínica...), com `businessType`, `plan`
  (BASICO | PRO | ENTERPRISE), branding e `customLabels`/`settings` (JSON)
- `User` — login, `role` (SUPER_ADMIN | ADMIN | PROFESSIONAL) e `tenantId` (nulo só pro SUPER_ADMIN;
  email único por tenant, não global)
- `Professional` — perfil de agenda (1:1 com um User de role PROFESSIONAL), com `customFields` (JSON)
- `AvailabilitySlot` — grade semanal recorrente de horários de trabalho (`stepMinutes` controla de
  quanto em quanto tempo sugerir um horário de início, não a duração do atendimento). Editável pelo
  ADMIN (ou pelo próprio profissional) em `/dashboard/[professionalId]/hours`
- `ScheduleBlock` — bloqueios pontuais (férias, folgas)
- `Service` — catálogo de serviços/procedimentos do tenant, cada um com sua própria duração
  (`defaultDurationMin`) e preço opcional. Editável em `/dashboard/services`
- `ProfessionalService` — liga um profissional aos serviços que ele realiza, permitindo sobrescrever
  a duração/preço padrão só pra ele (ex: um profissional mais rápido nesse serviço específico)
- `Appointment` — agendamentos, com `status`, `source` (manual | n8n | public_form), `serviceId`
  (opcional), `customFields` e `price` (preço "congelado" no momento da criação - não muda
  retroativamente se o preço do serviço mudar depois, o que mantém os relatórios financeiros corretos)
- `ApiKey` — uma por tenant, usada pelas rotas `/api/n8n/*`

## Planos (campo `plan` no Tenant)

O campo `plan` (BASICO | PRO | ENTERPRISE) existe pra você diferenciar o nível de contrato de cada
cliente. Hoje ele só é armazenado e exibido — a integração N8N funciona igual pra todos os planos
(as rotas `/api/n8n/*` não fazem distinção). A diferença de plano pretendida é o **nível de
inteligência do agente configurado no N8N** (respostas prontas no Básico, IA que conversa de verdade
no Pro/Enterprise) — isso vive inteiramente do lado do workflow do N8N que você publica pra cada
cliente, não requer nenhuma trava no código da plataforma. Use o `plan` como referência na hora de
montar/escolher qual workflow publicar.

## Gestão da agenda pelo ADMIN

A secretária/admin de cada tenant pode, direto pelo dashboard:
- **Criar agendamentos manualmente** — em `/dashboard/[professionalId]`, botão "+ Novo [serviço]":
  escolhe o serviço, a data, um horário disponível (mesmo motor de disponibilidade usado pelo N8N),
  e o nome/telefone do cliente
- **Cancelar ou marcar como concluído** — cada agendamento na lista tem essas ações
- **Editar o horário de funcionamento** — em `/dashboard/[professionalId]/hours`, define os dias e
  horários de expediente de cada profissional
- **Ver o faturamento** — em `/dashboard/reports`, quanto cada profissional faturou no mês (soma o
  campo `price` dos agendamentos concluídos)

Profissionais têm as mesmas ações, mas só na própria agenda.

## Próximos passos sugeridos

- Tela de administração para cadastro de profissionais e usuários dentro de cada tenant (hoje via
  `prisma studio`)
- Tela de agenda em calendário visual (dia/semana), além da lista atual
- Webhook de saída (Next.js → N8N) para notificar automações quando um agendamento é criado/cancelado
  manualmente pela secretária, mantendo os dois lados sincronizados
- Rate limiting nas rotas `/api/n8n/*` (ex.: com Upstash) para proteger contra abuso
- Cobrança de verdade por plano (integração com Stripe, hoje o `plan` é só informativo)
- Opção de suspender/reativar um tenant direto pela tela `/admin` (hoje só via `active` no banco)
- Trava de limites por plano (ex.: nº de profissionais) se você decidir usar `plan` tecnicamente,
  não só como referência
