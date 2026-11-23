# Branching: `master` mirrors upstream, `main` is ours

The repo is a fork of `unbe/ai-shv-app`. Contributing back is optional.

## Keep `master` a clean mirror

Never commit to `master`; optionally add a branch ruleset that blocks direct pushes. Sync it from the upstream repo:

```bash
gh repo sync simonsteiner/shv-meteo-web --branch master --source unbe/ai-shv-app
```

Always pass `--branch master`: the fork's default branch is `main` and upstream has no `main`. Or locally:

```bash
git remote add upstream https://github.com/unbe/ai-shv-app.git   # once
git fetch upstream
git push origin upstream/master:master                           # fast-forward only
```

## Take upstream fixes into `main`

```bash
git log --oneline main..master       # new upstream commits
git cherry -v main master            # "+" = not yet applied
git cherry-pick -x <sha>             # on a branch from main, then a normal PR
```

PR3 reformatted every file with prettier, so the upstream repo's patches no longer apply textually. To take one, run `npx prettier --write` over the touched files on a scratch branch from `master`, commit, then cherry-pick that commit; or apply the fix by hand. Legacy files keep their paths until their refactor PR, so paths still match until then.

## Contribute back (optional)

Fixes the upstream repo could use, written fresh against `master` (this stack fixes them inside TypeScript rewrites that won't cherry-pick): the timeseries cache key (`server/index.js:42`), the Foehn timezone (`:122-123`), the inline `onerror` XSS (`BottomSheet.js:340`, `WeatherView.js:256`), deleting the dead `emagram_calc.py` routes. Branch from `master`, apply only that change, and open the PR against `unbe/ai-shv-app:master`. Never base an upstream PR on `main`.
