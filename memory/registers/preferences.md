# Preferences Register

> Load when: task involves user's style, workflow, or communication preferences.
> Contains: code style, communication style, workflow preferences, tool preferences.

## Workflow
- Commit after each logical unit of work — never let multiple unrelated changes pile up
- Always run tests before committing; build must be clean before shipping
- Use `pnpm run` not `npm run` — avoids pnpm config token warnings
- Performance reviews requested periodically; store as `claude_performance_review_<Month>.md` in project root

## Communication
- Terse responses preferred — lead with the answer, skip preamble
- No emojis unless explicitly requested
- When suggesting feature ideas, give a ranked list with brief rationale — don't implement without being asked

## Code Style
- TypeScript strict mode; never use `as` casts when a generic form works
- No unnecessary abstractions — three similar lines beats a premature helper
- Tests mirror source structure; `.test.ts` files are canonical over `.test.js`
