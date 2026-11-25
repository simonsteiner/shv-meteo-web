# Audit brief: Swiss Free Flight (shv-meteo-web)

Repo: the repo root (branch main). Read AGENTS.md first: it holds the project's conventions and hard constraints, and GLOSSARY.md has the domain terms.

## Context

A static Astro site + Cloudflare Pages Functions that shows Swiss paragliding/hang gliding flying sites, airspace, live weather, webcams and soaring forecasts (sounding/emagram, foehn) from the public data behind the official SHV FSVL app. The initial version was written by someone else (LLM-generated, never human-reviewed). The current owner migrated it to Astro + TypeScript and did a few review rounds. So: comments, docs and claims about upstream APIs are hints, not facts. Verify them.

## Goal

A thorough, independent audit. Find real problems, not style nits. Priorities:

1. **Correctness of the domain logic**, which pilots may rely on for safety: unit conversions (src/scripts/units.ts and its callers), wind/gust handling, sounding/emagram math (src/scripts/emagram/), foehn pressure gradients and station pairs (src/scripts/foehn/), Previtemps grid (src/data/previtemps_grid.json, scripts/), safety logic (src/scripts/safety/), time zones and timestamps (UTC vs Europe/Zurich, DST), airspace/obstacle handling, featureLatLng and geometry.
2. **Claims about upstreams that may be wrong**: endpoints, parameters, units, field meanings, as written in code and in docs/reference/, docs/architecture/, docs/research/. The official Android app's APK is at apk_analysis/shv-1.1.0/ (base.apk plus splits; git-ignored). You may unzip/decompile it into your own scratch directory (NOT inside the repo) to check a claim; jadx is not installed, so if needed fetch a jadx release into your scratch dir, or grep strings/dex/assets/JS bundle (it may be React Native / Flutter, check). Cite the APK evidence (file + string/class) for each claim you confirm or refute. You may also make read-only GET requests to the public upstreams to check units/shape.
3. **Security**: XSS (escapeHtml/safeUrl/sanitizeForecastHtml coverage, any innerHTML with unescaped data), CSP, the Functions as open proxies (param validation in src/scripts/upstream/params.ts, SSRF), cache poisoning in respond.ts, secrets, member data leakage.
4. **Functions/caching robustness**: respond.ts error and fallback paths, timeouts, cache keys, TTLs.
5. **Convention violations from AGENTS.md** that cause real bugs: fetch outside ShvApi, ES2020+ builtins in browser code (Object.hasOwn, .at(), structuredClone, etc.), swallowed errors, missing i18n keys across de/fr/it/en, mock/synthesized data (hard constraint), indexing geometry.coordinates directly.
6. **Tests** that assert nothing meaningful, or important logic with no tests. Docs that contradict code.

You may run: npm test, npm run typecheck, npm run lint, npm run build (all read-only with respect to source). Don't run npm run dev unless you need to check something live.

## Rules

- **Read-only.** Do not edit, create or delete anything in the repo, do not commit, branch, or push. Put scratch files (decompiled APK, notes) under your own directory: OUTDIR/scratch/ (a temporary directory per agent; the reports were copied here afterwards).
- Verify each finding against the code before reporting it. Mark each as CONFIRMED (you traced it / reproduced it) or PLAUSIBLE (strong suspicion, not proven).
- Skip pure style/formatting.

## Output

Write your report to OUTFILE as Markdown. One section per finding, ranked most severe first:

- **ID / title**
- **Severity**: critical / high / medium / low
- **Category**: domain-correctness / upstream-claim / security / robustness / convention / tests / docs
- **Location**: path:line (repo-relative)
- **Evidence**: what the code does, and for upstream claims the APK or live-response evidence
- **Impact**: concrete scenario: input/state, then wrong output or failure
- **Fix**: short suggestion
- **Verdict**: CONFIRMED or PLAUSIBLE
End with a short list of the areas you checked and found OK, and anything you could not check. Your final message should be a short summary plus the path to the report.
