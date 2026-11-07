# hackclub.rsvp

the one Hack Club rsvp platform to rule them all!

## what is this for?

this platform is intended as a replacement for some other rsvp platforms that Hack Club ysws organizers would use to gauge interest for their programs. it supports (as of now) both online ysws events and in-person meetups (like stardance expeditions). i'm working on being able to add custom domains through cloudflare and some other cool stuff.

### what works right now

- log in with Hack Club Auth
- create events, each with its own page at `slug.hackclub.rsvp`
- rsvps with capacity limits and a waitlist that auto-promotes people when spots open up
- confirmation + reminder emails (with a calendar `.ics` file)
- an organizer roster with filtering and csv export
- cancelling events (everyone who rsvp'd gets an email)

### coming soon

- slack notifications
- custom domains (like `customrsvp.hackclub.rsvp`)
- a public api, webhooks, and an embeddable widget for ysws sites

## local development

you'll need:

- node 26 (see `.nvmrc`)
- a postgres database
- a Hack Club Auth app (make one at [auth.hackclub.com](https://auth.hackclub.com)) with `http://localhost:3000/oauth/callback` as a redirect uri

run:

```bash
cp .env.example .env
```

then, after filling out all of your env vars (see below)
run:

```bash
npm i
npm run migrate
npm run dev
```

and open [localhost:3000](http://localhost:3000)!

> [!TIP]
> if you set `ROOT_DOMAIN=localhost` in your `.env`, event pages work at `your-slug.localhost:3000`, just like `your-slug.hackclub.rsvp` in prod.

## env vars

| var                                                                     | needed?    | what it's for                                                                                                |
| ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `ROOT_DOMAIN`                                                           | yes        | the main domain, `hackclub.rsvp` in prod (or `localhost` locally)                                            |
| `DATABASE_URL`                                                          | yes        | postgres connection string                                                                                   |
| `SESSION_SECRET`                                                        | yes        | signs login cookies, make it long and random (`openssl rand -hex 32`)                                        |
| `HCA_CLIENT_ID`, `HCA_CLIENT_SECRET`                                    | yes        | your Hack Club Auth app                                                                                      |
| `HCA_REDIRECT_URI`                                                      | yes        | `http://localhost:3000/oauth/callback` locally                                                               |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`         | for emails | smtp relay from your mail provider. if these are blank, emails just wait in the queue until you fill them in |
| `CF_TOKEN`, `CF_ZONE_ID`, `CF_MAX_DOMAINS`, `CF_DOMAIN_TTL_DAYS`        | not yet    | cloudflare stuff for custom domains (coming soon)                                                            |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_ORGANIZER_CHANNEL_ID` | not yet    | slack notifications (coming soon)                                                                            |

> [!WARNING]
> never commit your `.env`! it's already gitignored, so just don't force-add it :)

## scripts

| script              | what it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | runs this project on a local port (3000 by default)       |
| `npm run build`     | compiles this project for production                      |
| `npm run start`     | runs the production build                                 |
| `npm run migrate`   | applies any new database migrations from `migrations/`    |
| `npm run lint`      | scans the codebase for bugs and style issues with eslint  |
| `npm run typecheck` | scans the codebase for TypeScript errors (`tsc --noEmit`) |
| `npm run test`      | runs the entire test suite once with vitest               |

## tests

some tests are pure functions and run anywhere, but the ones ending in `.db.test.ts` need a real postgres database. the database name **has** to end in `_test` (the tests wipe it between runs, so this keeps them away from your real data).

```bash
createdb rsvp_test
echo 'TEST_DATABASE_URL=postgres://localhost/rsvp_test' > .env.test
npm run test
```

## project layout

| folder         | what's in it                                                |
| -------------- | ----------------------------------------------------------- |
| `src/app`      | pages and routes (dashboard, event pages, login)            |
| `src/lib`      | the actual logic (rsvps, waitlist, emails, auth, csv, etc.) |
| `src/proxy.ts` | routes `slug.hackclub.rsvp` to the right event page         |
| `migrations/`  | sql migrations, run in order by `npm run migrate`           |
| `scripts/`     | the migration runner                                        |
| `tests/`       | all of the tests                                            |
| `docs/`        | plans and docs (like the api)                               |

(yes yes i know this is a sign of an ai readme but i believe its useful for ppl who wanna make changes to this app)

## api

not quite yet ✌️

<!-- check out [docs/api.md](docs/api.md) 👍 (it's still a plan, the api isn't built yet!) -->

## deployment

this runs on [dokploy](https://dokploy.com) using the `Dockerfile` in this repo. when the container starts, it automatically runs any new migrations and then starts the server, so you don't have to manually run the migrations. set all the env vars from `.env.example` in dokploy, and make sure `HCA_REDIRECT_URI` points to `https://hackclub.rsvp/oauth/callback` (or your local link).

## contributing

prs are welcome! before you open one, make sure these all pass:

```bash
npm run lint
npm run typecheck
npm run test
```
