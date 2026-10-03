# Versioned production knowledge

These files are read-only inputs for content workers and reviewers during a
production batch. Agents may propose changes, but the coordinator must approve
and version them before a later batch receives the new snapshot.

The current manifest is generated from the validated packages:

```text
npm run content:manifest
```

This directory is not learner-facing content. It records the shared rules and
context needed to keep independently authored packets consistent.
