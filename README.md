# Research crew

A multi-agent system you can watch. Give it a brand's question and a crew of Claude agents researches it:
three analysts in parallel (macro, consumer trends, competitors), an **assembly** pass that finds
contradictions and gaps, one round of **follow-up** agents on those gaps, a second assembly pass that
writes the report, and a **fact-checker** that never saw the drafting and marks every claim
supported, unsupported or contradicted.

The page shows the crew working two ways: a **pixel office** where each agent is a sprite that walks to
the search counter, the library, or its desk, and hands its paper to the next desk when it finishes —
and a **pipeline** map, CI-style. Every run is recorded and replays at 1×–20× with a scrubber.

## Run it locally

```sh
pnpm install
pnpm research run "We're a UK specialty coffee subscription brand, about 40,000 subscribers at £18 a month, planning to launch in Germany in Q1 2027. What do German consumers expect from a coffee subscription, who would we be competing with, and what regulation or logistics could trip us up?"
```

The first line printed is the page URL. Agents run through the Claude Agent SDK on your local Claude
Code login; no API key needed. A run takes 10–15 minutes and roughly $20 on `claude-opus-5`.

- `pnpm research serve` — the page alone, listing past runs (new runs can be started from the page)
- `pnpm research replay <runId> --speed 4` — replay a recorded run from the CLI
- `pnpm research sample` — a built-in, made-up run for checking the page without any API calls

Runs live in `data/research/<runId>/` (`events.jsonl` and `report.md`).

## Hosting the page while the agents run on your machine

The agents need your Claude Code login, so the run server stays on your laptop. The page is static and
can live anywhere; it just needs the server's public URL.

```sh
pnpm research serve                                   # the run server, port 4100
cloudflared tunnel --url http://localhost:4100        # a public URL for it (prints https://….trycloudflare.com)
```

On Vercel, set `RESEARCH_API` to that URL and deploy: the build runs `pnpm research export`, which
writes `site/` with the page and a `config.js` pointing at your tunnel. If the tunnel URL changes, either
update the env var and redeploy, or open the page with `?api=https://new-url` — it remembers.

## Layout

- `src/pipeline.ts` — the stages and how they hand off
- `src/agent-turn.ts` — one agent's turn through the Agent SDK, streamed into run events
- `src/prompts.ts`, `src/schemas.ts` — what each agent is told and must return
- `src/server.ts` — Hono server: page, run list, per-run SSE stream
- `src/cli.ts` — `run`, `serve`, `replay`, `sample`, `export`
- `ui/index.html` — the page (pipeline map, all-agents trace, report with claim verdicts, replay controls)
- `ui/office.js` — the pixel office
