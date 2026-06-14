# Frontend

## Purpose
React 19 + TypeScript single-page application providing the DHCP Dashboard user interface. Built with shadcn/ui, Tailwind CSS v4, TanStack Query, Recharts, and Lucide icons.

## Ownership
Owned by the root AGENTS.md. All frontend code must comply with project-wide standards and the DOX framework.

## Local Contracts
- Uses Vite as the build tool with proxy to backend on port 8000.
- All API calls go through `src/lib/api.ts` with JWT interceptor.
- Auth token stored in `localStorage` key `access_token`.
- All pages lazy-loaded with Suspense + Skeleton fallback.
- Consistent glassmorphism styling via `bg-background/60 backdrop-blur-sm border-border/50 shadow-lg rounded-xl`.
- Error boundaries wrap every page; errors surface via `sonner` toast.

## Work Guidance
- Use `npm run dev` for development (proxies to backend on port 8000).
- Use `npm run build` for production build.
- New pages go in `src/pages/` and must be added to the router in `App.tsx`.
- Reusable components go in `src/components/`.
- Custom hooks go in `src/hooks/`.
- TypeScript interfaces go in `src/types/`.
- Follow existing patterns in `Dashboard.tsx` for data-fetching pages.

## Verification
- `npm run build` must complete without errors.
- `npm run dev` must start and serve the app on port 5173.
- Login flow must store token and redirect to dashboard.
- All pages must render with loading skeletons and handle errors gracefully.

## Child DOX Index
No child DOX files — subdirectories are structural (pages, components, lib, etc.), not independent domains.
