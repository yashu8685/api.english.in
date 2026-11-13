# Fluent — API

The backend for **Fluent**, a B1–B2 English practice platform: vocabulary
reviews with server-side spaced repetition, grammar lessons with explained
quizzes, UK-English speaking drills with optional phoneme scoring, dictation,
a streaming conversation tutor, XP, streaks and daily activity.

Node + Hono + Drizzle + Better Auth, with Zod-validated configuration, real
httpOnly cookie sessions and committed SQL migrations.

- Frontend: [`../web`](../web)
- Database: Neon Postgres (or the bundled local Postgres)

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| API | Hono on Node (`@hono/node-server`) | Tiny, typed, portable to Workers/Bun later |
| Database | Neon Postgres | Serverless Postgres with a generous free tier |
| ORM | Drizzle ORM + drizzle-kit | SQL-first schema, typed queries, committed migrations |
| Auth | Better Auth (Drizzle adapter) | Email/password, hashed passwords, httpOnly cookie sessions |
| Validation | Zod 4 | One schema mirrored by the frontend |
| Config | Zod-validated `process.env` | Fail fast at boot instead of at 3am |
| Build | tsup | Simple, fast, no framework lock-in |
| Tests | Vitest | Unit + in-process API integration tests |

## Layout

```
api/
├── drizzle/                 # Committed SQL migrations + journal
├── drizzle.config.ts
├── src/
│   ├── app.ts               # middleware + route composition
│   ├── index.ts             # Node server bootstrap
│   ├── env.ts               # Zod-validated environment
│   ├── db/                  # Drizzle schema, client, seed, env loader
│   ├── lib/                 # auth, SRS, speech scoring, tutor, XP/streak, errors
│   ├── middleware/          # session guard, rate limit
│   └── routes/              # me, vocabulary, lessons, speaking, listening, tutor
├── tests/                   # Vitest unit + API integration tests
├── scripts/
│   ├── local-db.mjs         # Postgres without Docker (embedded-postgres)
│   ├── reset-db.mjs         # drop schemas → migrate → seed
│   └── test-db.ts           # rebuild the isolated fluent_test database
├── contracts.ts             # Zod request/response contract (mirrored in ../web)
├── tsconfig.base.json
└── docker-compose.yml       # local Postgres 16
```

## Quick start

**Requirements:** Node `>=20.19` and Postgres (Neon, Docker, or the embedded
local option below).

```bash
npm install
cp .env.example .env

# Generate a real secret and paste it into .env
openssl rand -base64 32

# Pick a database (see below), then:
npm run db:migrate
npm run db:seed

npm run dev
```

The API listens on **http://localhost:8787** (health check: `/health`).
Start the frontend separately from [`../web`](../web).

### Getting a local database

```bash
# A. Docker (recommended if you have it)
docker compose up -d

# B. No Docker — portable Postgres in the foreground (Ctrl+C to stop)
npm run db:local

# C. Neon — paste the connection string into DATABASE_URL
```

All three options use the same `DATABASE_URL` shape
(`fluent:fluent@localhost:5432/fluent` for A and B), so nothing else changes.

## Environment variables

Values live in `api/.env` and are validated at boot by `src/env.ts`. Missing or
malformed values stop the process with a readable message.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Neon or local) |
| `BETTER_AUTH_SECRET` | yes | 32+ random chars. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Public URL of the API, e.g. `https://api.example.com` |
| `WEB_ORIGIN` | yes | Exact web origin for CORS + trusted auth origin, no trailing slash |
| `PORT` | no | API port, default `8787` |
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `OPENAI_API_KEY` | no | Enables AI tutor replies **and** server-side transcription for recorded attempts. Leave empty for the local coach + typed fallback. |
| `OPENAI_BASE_URL` | no | Any OpenAI-compatible endpoint (default `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | no | Chat model name (default `gpt-4o-mini`) |
| `OPENAI_TRANSCRIBE_MODEL` | no | Speech-to-text model (default `whisper-1`) |
| `AZURE_SPEECH_KEY` | no | Enables phoneme-level pronunciation assessment |
| `AZURE_SPEECH_REGION` | no | Azure region for the Speech resource (e.g. `uksouth`) |
| `AUDIO_STORAGE_ENABLED` | no | Allow opt-in recording storage, default `true` |
| `AUDIO_STORAGE_DIR` | no | Where kept recordings live, default `./.uploads` (git-ignored) |
| `TEST_DATABASE_URL` | no | Test database, default `postgresql://fluent:fluent@localhost:5432/fluent_test`. Tests never touch `DATABASE_URL`. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API with watch mode |
| `npm run build` | Bundle the API with tsup |
| `npm start` | Run the built API (`dist/index.js`) |
| `npm run typecheck` | Type-check the API, tests and scripts |
| `npm test` | Vitest unit + API integration tests (isolated `fluent_test` DB) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply committed migrations (non-interactive) |
| `npm run db:push` | Push schema directly — fast local iteration only |
| `npm run db:seed` | Insert the starter deck, lessons, speaking phrases and dictation clips (idempotent) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:reset` | Drop `public` + `drizzle` schemas → migrate → seed (refuses in production) |
| `npm run db:local` | Start embedded Postgres on `:5432` without Docker |
| `npm run smoke:live` | Check the real `DATABASE_URL` and `OPENAI_*` values end to end, then delete the throwaway user |
| `npm run setup` | `npm install` + migrate + seed |

## How it works

### Request lifecycle

```
Browser (React + TanStack Query, ../web)
  │  fetch(..., { credentials: "include" })
  ▼
Hono API (Node, :8787)
  │  requestId → logger → secureHeaders → bodyLimit → CORS
  │  /api/auth/*  → Better Auth handler
  │  /api/*       → requireAuth → route handler → Zod parse
  ▼
Drizzle ORM → node-postgres pool → Postgres (Neon or local)
```

### Auth

- Better Auth owns `/api/auth/*`: sign-up, sign-in, sign-out, session.
- Passwords are hashed by Better Auth; the API never sees a plaintext password
  after the request that creates it.
- Sessions are stored in Postgres and delivered as `httpOnly`, `sameSite=lax`
  cookies (`secure` in production). No tokens in `localStorage`.
- Every route behind `/api/*` (except auth) runs `requireAuth`.

### One contract, two runtimes

`contracts.ts` defines every request and response with Zod. The API validates
bodies with those schemas; the web app validates responses with the same
schemas. **`api/contracts.ts` and `../web/contracts.ts` are intentionally
separate copies** — when you change one, change the other in the same commit.

### Spaced repetition

`src/lib/srs.ts` implements an SM-2-flavoured scheduler on the server:

| Rating | Effect |
| --- | --- |
| Again | reps reset, ease −0.2, due in 10 minutes, +2 XP |
| Hard | ease −0.15, short interval, +6 XP |
| Good | 2 days → 5 days → interval × ease, +10 XP |
| Easy | ease +0.1, 3 days → 7 days → interval × ease × 1.25, +12 XP |

A card is “mature” after 3 reps and a 7+ day interval. Every review runs in a
transaction that also updates XP, the daily activity ledger and the streak, so
the dashboard can never disagree with the deck.

### Speaking drills (UK English)

`src/lib/speech.ts` scores a transcript against a target phrase. On
Chrome/Edge recognition runs in the browser (Web Speech API, `lang: "en-GB"`);
everywhere else the recording is uploaded and transcribed server-side. Audio is
converted to 16 kHz mono WAV in the browser, so the same clip works for both
speech-to-text and Azure pronunciation assessment.

The word scorer normalises case, punctuation, apostrophes and dashes, aligns
words with a longest-common-subsequence pass, and penalises rambling:

- **≥95%** → 15 XP · **≥80%** → 12 XP · **≥60%** → 9 XP · below → 6 XP.
- Full XP is awarded once per phrase per day; repeat attempts still count
  towards the streak but earn 2 XP.
- Feedback names the first three missed words so the learner knows what to
  repeat.

**Phoneme scoring (optional).** With `AZURE_SPEECH_KEY` and
`AZURE_SPEECH_REGION`, `src/lib/azure.ts` sends the clip to Azure's
pronunciation-assessment endpoint with the target as the reference text. The
attempt's `score` becomes the phoneme `PronScore`, and the response adds
accuracy, fluency, completeness and per-word phoneme scores. Without Azure the
attempt falls back to word accuracy and the response says
`provider: "word-accuracy"`; a failed Azure call never fails the attempt.

**Storage (opt-in).** Audio is always uploaded for scoring and discarded
immediately unless the learner ticks "Save this recording". Kept files live
outside the web root in `AUDIO_STORAGE_DIR` and are served only through
`GET /api/speaking/attempts/:id/audio`, which checks ownership.
`DELETE /api/speaking/attempts/:id` removes the row and the file.

### Listening and dictation (UK English)

`POST /api/listening/attempt` reuses the same scorer in dictation mode. The web
app reads each clip aloud with an `en-GB` voice (normal or slow), the learner
types what they heard, and the API returns a score plus word-level feedback.
Eight seeded clips cover stations, cafés, phone calls, weather and renting. XP
follows the same tiers and daily cap as speaking.

### Conversation tutor

`src/lib/tutor.ts` keeps one conversation per user per scenario (café,
interview, small talk, travel, renting) and stores the transcript in
`tutor_conversations` / `tutor_messages`.

- **With `OPENAI_API_KEY`** — calls any OpenAI-compatible
  `/chat/completions` endpoint with a British-tutor system prompt. The
  non-streaming route asks for `{"reply", "correction"}` JSON; the streaming
  route (`POST /api/tutor/chat/stream`) asks for plain text and sends
  `text/event-stream` frames (`meta` → `delta`* → `done`).
- **Without a key** — falls back to a deterministic local coach. It still runs
  the scenario, flags common Americanisms (`color` → `colour`,
  `apartment` → `flat`, `elevator` → `lift`, …) and grammar slips
  (`I am agree`, `he don't`, `more better`), then asks a follow-up question.
  The reply is streamed word by word so the UI behaves the same way.

Corrections are computed from the deterministic rule set in both modes, so the
coaching note is consistent and available before the first token. If the
upstream model is unreachable before it emits anything, the stream silently
falls back to the local coach instead of failing the turn.

The response includes `provider: "openai" | "local"` so the UI can say which
mode is active.

### Data model

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth |
| `profiles` | Level, daily goal, XP, streak, last study day (created lazily) |
| `words` | Global deck: term, IPA, meaning, example, synonyms, level |
| `user_words` | Per-user SM-2 state, unique on `(user_id, word_id)` |
| `lessons` | Global lessons; `content` is JSONB validated on read |
| `lesson_attempts` | Every quiz submission |
| `speaking_phrases` | Global UK-English drill phrases: text, focus, coaching tip, level |
| `speaking_attempts` | Transcript, score, assessment JSONB, optional kept audio path |
| `dictation_clips` | Global listening clips: text, hint, level |
| `dictation_attempts` | Typed transcript + score per attempt |
| `tutor_conversations` | One row per user per scenario |
| `tutor_messages` | Stored user/assistant turns |
| `daily_activity` | XP/cards/lessons per user per day, unique on `(user_id, day)` |

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | – | Liveness + environment |
| `POST` | `/api/auth/sign-up/email` | – | Create account (Better Auth) |
| `POST` | `/api/auth/sign-in/email` | – | Sign in (Better Auth) |
| `POST` | `/api/auth/sign-out` | cookie | Sign out |
| `GET` | `/api/auth/get-session` | cookie | Current session |
| `GET` | `/api/me` | ✔ | User + profile |
| `PATCH` | `/api/me` | ✔ | Update display name, level, daily goal |
| `GET` | `/api/stats` | ✔ | XP, streak, due/new/mature counts, lessons |
| `GET` | `/api/vocabulary` | ✔ | Full deck with per-user progress |
| `POST` | `/api/vocabulary/review` | ✔ | Grade a card, reschedule, award XP |
| `GET` | `/api/lessons` | ✔ | Lesson list with attempts + best score |
| `GET` | `/api/lessons/:slug` | ✔ | Lesson content and quiz |
| `POST` | `/api/lessons/:slug/attempts` | ✔ | Record a quiz score and award XP |
| `GET` | `/api/speaking` | ✔ | UK drill phrases, best scores and configured capabilities |
| `POST` | `/api/speaking/attempt` | ✔ | Score JSON or multipart audio, assess phonemes, optionally store the clip |
| `GET` | `/api/speaking/attempts/:id/audio` | ✔ | Stream a kept recording to its owner |
| `DELETE` | `/api/speaking/attempts/:id` | ✔ | Delete an attempt and its recording |
| `GET` | `/api/listening` | ✔ | Dictation clips with attempts + best score |
| `POST` | `/api/listening/attempt` | ✔ | Score a dictation transcript and award XP |
| `GET` | `/api/tutor/history?scenario=` | ✔ | Stored conversation (or an empty one with an opener) |
| `POST` | `/api/tutor/chat` | ✔ | Send a message and get a tutor reply + correction |
| `POST` | `/api/tutor/chat/stream` | ✔ | Same turn as SSE (`meta`, `delta`, `done`) |
| `DELETE` | `/api/tutor/history?scenario=` | ✔ | Start the scenario over |

Errors always have the same shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid.",
    "requestId": "…",
    "details": { "email": { "errors": ["Enter a valid email address"] } }
  }
}
```

## Testing

Tests use a **separate database** (`fluent_test` by default) that is dropped,
migrated and seeded automatically. Development data is never touched.

```bash
# Postgres must be running (npm run db:local, or docker compose up -d)
npm test
```

| Suite | File | Covers |
| --- | --- | --- |
| Unit | `tests/srs.test.ts` | SM-2 transitions, ease floors/ceilings, XP, maturity |
| Unit | `tests/activity.test.ts` | UTC day keys, streak continuation/reset across boundaries |
| Unit | `tests/speech.test.ts` | Tokenising, LCS word alignment, extra-word penalty, XP tiers, dictation feedback |
| Unit | `tests/tutor.test.ts` | Local coach: British vocabulary/grammar fixes, clean replies, prompt rotation, streamed chunks |
| API | `tests/api.test.ts` | Auth guard, sign-up/sign-out, profile validation, review → stats, lesson attempts, speaking/listening scoring, multipart audio + storage + deletion, tutor history/chat/SSE |

The API suite calls the Hono app in-process with `app.request()`, so it needs no
running server. `scripts/test-db.ts` is shared with the frontend's Playwright
suite in [`../web`](../web), which runs the browser-level flows.

### Verifying live services

`npm test` never touches the network. To check the real credentials in `api/.env`:

```bash
npm run smoke:live
```

It signs up a throwaway user, then checks:

| Check | What it proves |
| --- | --- |
| `database` | `DATABASE_URL` connects and the seed is present |
| `auth` | Sign-up, session cookie and `/api/me` work |
| `tutor` | `POST /api/tutor/chat/stream` reports `provider: "openai"` and streams a real reply |
| `speech` | OpenAI TTS → 16 kHz WAV → multipart attempt → Whisper transcript → score + XP |
| `phonemes` | Only when Azure is configured: assessment provider is `azure` with per-word scores |

Checks whose keys are missing are reported as skipped, not failed, and the
throwaway account is deleted afterwards.


## Deploying

### Database (Neon)

1. Create a Neon project and a database named `fluent`.
2. Copy the **pooled** connection string into `DATABASE_URL` and keep
   `?sslmode=require`.
3. Run migrations as a release step (not at app boot):

```bash
npm run db:migrate
npm run db:seed   # first deploy only; idempotent
```

Commit every generated file in `drizzle/` so deploys are reproducible. Use
`db:generate` locally after changing the schema — never edit migrations by hand.

### API (Fly.io / Render / Railway / any Node host)

- Build: `npm run build`
- Start: `node dist/index.js` (or `npm start`)
- Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`,
  `NODE_ENV=production`.
- `BETTER_AUTH_URL` must be the exact public API URL; `WEB_ORIGIN` must be the
  exact public web origin. CORS is an allowlist, not `*`.

### Cookie caveat

Better Auth cookies use `sameSite: "lax"` (see `src/lib/auth.ts`). That works
when the web app and API are on the same site, e.g. `app.example.com` +
`api.example.com`, or `localhost:5173` + `localhost:8787`.

If you host them on unrelated domains (`app.vercel.app` + `api.fly.dev`), the
browser will not send the session cookie on cross-site requests. Either:

1. Put both behind one parent domain (recommended), or
2. Set `sameSite: "none"` and `secure: true` in `defaultCookieAttributes`,
   serve both over HTTPS, and add the web origin to `trustedOrigins`.

### Rate limiting

Auth routes are limited to 30 requests/minute per IP by an in-memory
fixed-window limiter (`src/middleware/rate-limit.ts`). That is fine for a single
instance. On multiple instances, move the bucket to Redis/Upstash. The limiter
reads `X-Forwarded-For`; make sure your reverse proxy overwrites that header
rather than appending client-supplied values.

### Edge / serverless

The API runs on Node and uses `node-postgres` over TCP. For Cloudflare Workers
or Vercel Edge, switch `src/db/index.ts` to export `client.edge.ts`
(`drizzle-orm/neon-http`) and confirm Better Auth is configured for that
runtime. The schema and routes do not change.

## Security notes

- Passwords: hashed by Better Auth; minimum 8 characters enforced by both Zod
  and Better Auth.
- Sessions: httpOnly cookies, 30-day expiry, refreshed at most once a day.
- Validation: every request body is parsed with Zod; unknown fields are dropped.
- SQL: Drizzle parameterises queries; no string-built SQL with user input.
- Headers: `secureHeaders()` + a 128 KB body limit.
- Errors: unexpected exceptions return a generic 500 with a request id; internal
  details are logged, never returned.

## Not in this slice

- Streaming phoneme results while the learner is still speaking. Assessment
  runs once per uploaded clip.
- Object storage (S3/R2) for recordings — `AUDIO_STORAGE_DIR` is local disk, so
  a multi-instance deployment needs a shared volume or a storage adapter.
- Automatic retention cleanup. Recordings stay until the learner deletes the
  attempt or you remove `AUDIO_STORAGE_DIR`.
- Email verification, password reset, OAuth providers — Better Auth supports
  them; they were left off to keep the first slice small.
- A CI pipeline. The suite is ready for it: run `npm test` with Postgres
  available.
