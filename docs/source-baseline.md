# Source baseline — BASE-01

Recorded October 2, 2026. The accepted prototype, existing evidence, Astra's revised plan, and unfunded M2 preflight were saved in local commit `bdfb77201d83c4db4b90732a479eb76209b4241e`, tagged `m1-accepted`. Nothing was pushed or published.

This commit preserves the existing M1 evidence as received. It establishes source identity and artifact retention; it does not retroactively prove that every earlier artifact was generated from this commit. The continuation changes and fresh browser evidence follow this baseline and are recorded in the next local commit. Use the tag to inspect the original evidence.

Before staging, checked the untracked inventory, ignore rules, text private-key/seed patterns, and exact local unlock values in frontend source/build/public evidence. The exact-value scan inspected 75 files and both local unlock values, with zero matches. This is a bounded check, not a general secret audit. `secrets/`, `data/`, wallet databases, logs, modules, build outputs, and browser working reports remain ignored. Intentionally sanitized evidence, lockfiles and original source are tracked. Sibling Tari snapshots remain outside the repository.

`git show m1-accepted:docs/evidence/m1/SHA256SUMS` retrieves baseline evidence hashes. `git log --oneline` shows the baseline and continuation. The baseline also contains planning/submission artifacts already present; it is not an approved public release.
