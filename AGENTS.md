# Project GitHub identity

This project exclusively uses the GitHub account `madeitallback`.
- Create repositories and push only under `madeitallback`.
- Keep Git author and committer identity configured locally for this repository.
- For GitHub CLI commands, set GH_CONFIG_DIR to this repository's `.git/gh-auth` directory. Verify `gh api user --jq .login` returns `madeitallback` before any remote write.
- Do not fall back to a globally authenticated account or change global Git/GitHub settings.
- Never commit `.env*`, `.vercel`, credentials, or generated build output.
