-- Conexão Google Calendar por usuário (OAuth refresh token).
CREATE TABLE "user_google_calendars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_google_calendars_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_google_calendars_userId_key" ON "user_google_calendars"("userId");

ALTER TABLE "user_google_calendars"
ADD CONSTRAINT "user_google_calendars_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_google_calendar_events" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_google_calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_google_calendar_events_agendamentoId_connectionId_key"
ON "user_google_calendar_events"("agendamentoId", "connectionId");

CREATE INDEX "user_google_calendar_events_connectionId_idx"
ON "user_google_calendar_events"("connectionId");

CREATE INDEX "user_google_calendar_events_agendamentoId_idx"
ON "user_google_calendar_events"("agendamentoId");

ALTER TABLE "user_google_calendar_events"
ADD CONSTRAINT "user_google_calendar_events_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "user_google_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_google_calendar_events"
ADD CONSTRAINT "user_google_calendar_events_agendamentoId_fkey"
FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
