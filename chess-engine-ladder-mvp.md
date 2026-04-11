# Chess Engine Ladder MVP Spec

## Product goal
Build a web application where users submit a single self-contained chess engine file, the platform validates it, runs it against existing ranked engines, and publishes a leaderboard. Engines must be UCI-compatible, uploaded as one file under 1 MB, and must not rely on network access, external libraries, helper files, or additional processes.[cite:18][cite:25][cite:36]

## Core product rules
- One uploaded file per submission, maximum 1 MB.
- Target runtime is x86_64 Linux ELF executable for MVP.
- Engine must speak UCI over stdin/stdout only.[cite:18]
- No external files, no downloaded assets, no opening books, no tablebases, no model files.
- No network access, no child processes, no external shared-library dependence by policy.
- The engine must survive a UCI handshake and basic readiness test before entering official matches.[cite:18]
- Every official match runs inside an isolated sandbox with no network and no privilege escalation.[cite:25][cite:36]

## MVP scope
The MVP should support a single public leaderboard, one time control, admin-visible submission review, automated placement matches, match history, and a simple Elo-based rating update. cutechess-cli is suited for repeated engine matches with PGN output, time controls, and engine command configuration, which makes it a good execution primitive for this product.[cite:1][cite:8]

Out of scope for MVP:
- Multiple leagues or divisions
- Live spectators
- User comments/forums
- Multiple hardware classes
- Public APIs for third-party automation
- Automatic opening-book management
- Full anti-cheat beyond sandboxing and audit logs

## User stories
### Submitter
- Create an account
- Upload one engine file
- See validation result
- See current rank, rating, and recent matches for accepted engines
- View placement progress and rejection reasons

### Viewer
- Browse leaderboard
- Open an engine page
- Open a match page
- Download or inspect PGN logs later

### Admin
- Review submissions
- Trigger revalidation
- Ban or disable broken engines
- Re-run placement or rating jobs
- Inspect validation logs and sandbox failures

## System architecture
The MVP should use a single web application, PostgreSQL, object storage, and worker processes for validation and match execution. PostgreSQL-backed job processing using row-locking patterns such as `FOR UPDATE SKIP LOCKED` is a practical MVP queue approach for moderate load.[cite:30][cite:37]

```text
Browser
  |
  v
Next.js Web App + API
  |
  +--> PostgreSQL
  |      - users
  |      - engines
  |      - engine_versions
  |      - matches
  |      - games
  |      - ratings
  |      - jobs
  |
  +--> Object Storage
  |      - uploaded engine binaries
  |      - match PGNs
  |      - validation logs
  |      - runner logs
  |
  +--> Validation Worker
  |      - file checks
  |      - ELF checks
  |      - UCI probe
  |
  +--> Match Worker
         - sandbox setup
         - cutechess-cli execution
         - result parsing
         - rating update trigger
```

## Recommended stack
| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js App Router | One app for pages, auth, admin, uploads |
| API | Next.js route handlers | Good enough for MVP CRUD and job creation |
| Database | PostgreSQL | Strong fit for relational match/rating data |
| Queue | PostgreSQL jobs table | Simple worker pull model using `SKIP LOCKED`[cite:30][cite:37] |
| Storage | S3-compatible storage | Store binary uploads, PGNs, logs |
| Validation worker | Python or Node service | Python is convenient for process control |
| Match execution | cutechess-cli | Built for engine-vs-engine automation[cite:1][cite:8] |
| Sandbox runtime | Docker | Use `--network none`, read-only filesystem, non-root, `no-new-privileges`[cite:25][cite:36] |
| Rating | Elo | Simpler than Glicko for MVP |

## End-to-end flow
1. User uploads one file from the submit page.
2. API enforces max size and creates a submission record.
3. API stores the file in object storage and enqueues a `submission.validate` job.
4. Validation worker downloads the file and performs static checks.
5. Validation worker launches a short UCI probe process and verifies `uci`/`uciok` and `isready`/`readyok` behavior.[cite:18]
6. If valid, the system marks the engine version validated and enqueues `placement.prepare`.
7. Placement logic selects the current top-ranked engine as the first defender.
8. Match worker runs a placement mini-match inside isolated sandboxes using cutechess-cli.[cite:1][cite:8]
9. If the challenger clears the promotion threshold, it is inserted above that defender; otherwise it continues downward until it wins a slot or lands last.
10. Match results, PGNs, ratings, and leaderboard entries are persisted.

## Ladder rules
Use a ladder for placement and Elo for long-term measurement. Placement should not depend on a single game because repeated automated matches are a stronger signal than one result, and cutechess-cli is intended for repeated engine match play.[cite:1][cite:8]

Suggested MVP placement rules:
- New engine starts by challenging rank #1.
- Placement match size: 8 games.
- Colors alternate evenly.
- One fixed time control for all official matches.
- Promotion threshold: score strictly greater than 50% for MVP.
- If the challenger fails against rank #N, try rank #N+1.
- Once the challenger clears a rank, place it directly above that defender.
- After placement, recompute cached leaderboard rank from current rating plus placement position rules.

## Security model
The uploaded engine is untrusted executable code. python-chess notes that chess engines are arbitrary executables and many make no guarantees, including memory safety, so they must be sandboxed before execution.[cite:13]

### Upload policy
- Single file only
- Maximum 1 MB
- Reject archives and multi-file containers
- Reject symlinks and directories
- Require executable ELF header for MVP
- Compute SHA-256 for dedupe and audit

### Runtime policy
Run every engine in an isolated container with:
- `--network none` to disable networking[cite:36]
- `--read-only`
- non-root user
- `--security-opt no-new-privileges` to prevent gaining extra privileges[cite:25]
- CPU and memory limits
- wall-clock timeout
- dedicated temporary writable directory if absolutely necessary
- no mounted secrets

### Static validation checks
Validation worker should run:
- file size check
- `file`
- `readelf -h`
- optional `ldd` or equivalent policy check to reject shared-library dependence
- strings scan for suspicious network/process patterns
- permission normalization (`chmod 0555` inside runner copy)

### UCI smoke test
The worker should spawn the engine and verify:
- `uci` => `uciok`
- `isready` => `readyok`
- optional `ucinewgame`
- optional `position startpos moves e2e4`
- `go movetime 100` returns `bestmove` within timeout[cite:18]

Reject the engine if any step fails.

## Database schema
### users
```sql
create table users (
  id uuid primary key,
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
```

### engines
```sql
create table engines (
  id uuid primary key,
  owner_user_id uuid not null references users(id),
  name text not null,
  slug text not null unique,
  description text,
  status text not null default 'pending' check (status in ('pending','active','rejected','banned','disabled')),
  current_version_id uuid,
  current_rating integer not null default 1200,
  current_rank integer,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### engine_versions
```sql
create table engine_versions (
  id uuid primary key,
  engine_id uuid not null references engines(id) on delete cascade,
  version_label text,
  storage_key text not null,
  sha256 text not null unique,
  file_size_bytes integer not null,
  target_arch text not null,
  is_static_binary boolean not null default false,
  validation_status text not null default 'pending' check (validation_status in ('pending','running','passed','failed')),
  validation_notes text,
  uci_name text,
  uci_author text,
  submitted_at timestamptz not null default now(),
  validated_at timestamptz
);
```

### submissions
```sql
create table submissions (
  id uuid primary key,
  engine_version_id uuid not null references engine_versions(id) on delete cascade,
  submitted_by_user_id uuid not null references users(id),
  status text not null default 'uploaded' check (
    status in ('uploaded','validating','validated','rejected','queued_for_placement','placed')
  ),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### matches
```sql
create table matches (
  id uuid primary key,
  match_type text not null check (match_type in ('placement','rating','admin')),
  challenger_engine_id uuid not null references engines(id),
  defender_engine_id uuid not null references engines(id),
  challenger_version_id uuid not null references engine_versions(id),
  defender_version_id uuid not null references engine_versions(id),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','canceled')),
  time_control text not null,
  games_planned integer not null,
  games_completed integer not null default 0,
  challenger_score numeric(5,2),
  defender_score numeric(5,2),
  winner_engine_id uuid references engines(id),
  pgn_storage_key text,
  log_storage_key text,
  started_at timestamptz,
  completed_at timestamptz
);
```

### games
```sql
create table games (
  id uuid primary key,
  match_id uuid not null references matches(id) on delete cascade,
  round_index integer not null,
  white_engine_id uuid not null references engines(id),
  black_engine_id uuid not null references engines(id),
  result text not null check (result in ('1-0','0-1','1/2-1/2')),
  termination text,
  opening_name text,
  ply_count integer,
  pgn_storage_key text,
  created_at timestamptz not null default now()
);
```

### ratings
```sql
create table ratings (
  id uuid primary key,
  engine_id uuid not null references engines(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  system text not null default 'elo' check (system in ('elo')),
  created_at timestamptz not null default now()
);
```

### jobs
```sql
create table jobs (
  id uuid primary key,
  job_type text not null check (job_type in ('submission.validate','placement.prepare','match.run','rating.apply')),
  payload_json jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  worker_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_pending_idx on jobs (status, run_at);
```

## API design
### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Submission
- `POST /api/submissions`
  - multipart upload
  - creates engine + version + submission
- `GET /api/submissions/:id`
- `GET /api/my/submissions`

### Leaderboard
- `GET /api/leaderboard`
- `GET /api/engines/:slug`
- `GET /api/engines/:id/matches`
- `GET /api/matches/:id`
- `GET /api/matches/:id/games`

### Admin
- `GET /api/admin/submissions`
- `POST /api/admin/submissions/:id/revalidate`
- `POST /api/admin/engines/:id/disable`
- `POST /api/admin/engines/:id/ban`
- `POST /api/admin/engines/:id/requeue-placement`

## Placement algorithm pseudocode
```text
function placeEngine(challengerEngineId):
  challenger = getActiveEngine(challengerEngineId)
  defenders = getLeaderboardOrderedByRankAsc()

  if defenders is empty:
    setRank(challenger, 1)
    return

  for defender in defenders:
    match = createPlacementMatch(challenger, defender, games=8)
    enqueueMatch(match)
    result = waitForCompletedMatch(match.id)

    if result.challengerScore > result.defenderScore:
      insertChallengerAbove(defender.id, challenger.id)
      normalizeRanks()
      updateRatingsFromMatch(match.id)
      return
    else:
      updateRatingsFromMatch(match.id)
      continue

  placeChallengerAtBottom(challenger.id)
  normalizeRanks()
```

## Worker logic
### Validation worker
```text
loop:
  job = claimNextJob('submission.validate')
  if no job: sleep
  mark job processing
  fetch submission/version/file
  run size/header/static checks
  run UCI smoke test
  if pass:
    mark version passed
    mark submission validated
    enqueue placement.prepare
  else:
    mark version failed
    mark submission rejected
    store rejection reason
  mark job completed or failed
```

### Match worker
```text
loop:
  job = claimNextJob('match.run')
  if no job: sleep
  mark job processing
  fetch match + engine binaries
  create isolated runner dirs
  run cutechess-cli with fixed policy
  parse PGN/results
  persist games + match summary
  enqueue rating.apply
  mark job completed or failed
```

## Suggested monorepo structure
```text
chess-ladder/
  apps/
    web/
      src/
        app/
          (public pages)
          leaderboard/
          submit/
          engines/[slug]/
          matches/[id]/
          admin/
        components/
        lib/
        server/
          auth/
          db/
          storage/
          jobs/
    worker/
      src/
        index.ts
        jobs/
        validation/
          fileChecks.ts
          elfChecks.ts
          uciProbe.ts
        matchmaking/
          placement.ts
          cutechess.ts
        ratings/
          elo.ts
        sandbox/
          runIsolated.ts
  packages/
    db/
      schema.sql
      migrations/
    shared/
      types.ts
      constants.ts
      env.ts
  infra/
    docker/
      worker.Dockerfile
      runner.Dockerfile
    scripts/
      migrate.sh
      seed.sh
  docs/
    mvp-notes.md
```

## Environment variables
### Web app
```env
DATABASE_URL=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
SESSION_SECRET=
```

### Worker
```env
DATABASE_URL=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
CUTECHESS_PATH=/usr/bin/cutechess-cli
RUNNER_IMAGE=chess-engine-runner:latest
MATCH_TIMEOUT_SECONDS=300
VALIDATION_TIMEOUT_SECONDS=10
```

## UI pages
### Public pages
- `/` leaderboard
- `/submit` upload form and rules
- `/engines/[slug]` engine detail page
- `/matches/[id]` match detail page

### Admin pages
- `/admin/submissions`
- `/admin/engines`
- `/admin/jobs`

## First sprint implementation order
1. Create database schema and migrations.
2. Build auth and basic submission UI.
3. Implement object storage upload.
4. Implement jobs table and worker claiming.
5. Implement validation worker with size and UCI checks.[cite:18]
6. Integrate sandbox runtime flags with Docker.[cite:25][cite:36]
7. Integrate cutechess-cli execution and PGN ingest.[cite:1][cite:8]
8. Build leaderboard and engine pages.
9. Add admin queue UI.
10. Add rating updates and rank normalization.

## Practical defaults for MVP
- Initial rating: 1200
- Placement match size: 8 games
- Official time control: 5+0.1 or similar blitz control
- Max worker concurrency: 1 to 4 matches depending on host CPU
- Submission review: admin approval optional but recommended for first launch
- One active engine version per engine identity

## Notes to feed into IDE
Generate the project as a monorepo with:
- `apps/web` as Next.js TypeScript app
- `apps/worker` as Node or Python worker service
- `packages/db` for schema and migrations
- Docker-based sandbox integration
- PostgreSQL jobs table instead of Redis for MVP
- S3-compatible storage adapter
- cutechess-cli wrapper module

Priority implementation modules:
- upload endpoint
- validation pipeline
- UCI probe
- placement service
- cutechess runner
- Elo update service
- leaderboard query service
- admin submissions page
