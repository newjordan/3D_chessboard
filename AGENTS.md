<!-- intent-skills:start -->
# Skill mappings - when working in these areas, load the linked skill file into context.
skills:
  - task: "Designing and implementing tRPC routers and base procedures"
    load: "node_modules/@trpc/server/skills/trpc-router/SKILL.md"
  - task: "Setting up tRPC server context, adapters, and environment"
    load: "node_modules/@trpc/server/skills/server-setup/SKILL.md"
  - task: "Managing database interactions and schema with Prisma"
    load: "node_modules/@prisma/client/skills/prisma-usage/SKILL.md"
  - task: "Handling environment variables and configuration"
    load: "node_modules/dotenv/skills/dotenv/SKILL.md"
  - task: "Implementing tRPC middlewares for security and logging"
    load: "node_modules/@trpc/server/skills/middlewares/SKILL.md"
<!-- intent-skills:end -->

# Chess Agents Project Context
This is a monorepo containing:
- `apps/api`: Express-based tRPC backend with Prisma and S3 integration.
- `apps/web`: Next.js frontend with tRPC and Next-Auth.
