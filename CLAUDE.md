# Instructions for AI agents working in this repository

## Every milestone PR adds its own study note

A pull request that finishes a milestone must add or update its note in
[docs/learn/](docs/learn/README.md) before it is merged. Use the file name
pattern and the sections listed in `docs/learn/README.md`. If the milestone
made an architecture decision, also add the ADR to
`docs/learn/decisions-in-plain-words.md`. Only state facts you can verify in
the repository, its pull requests or its CI runs; write "not verified"
otherwise.

## No secrets, ever

Never commit or write secrets anywhere in the repository: no tokens,
passwords, API keys, private keys, connection strings or personal data. This
applies to code, docs, examples, test fixtures and commit messages. Secrets
live only in GitHub Actions secrets and Google Secret Manager.
