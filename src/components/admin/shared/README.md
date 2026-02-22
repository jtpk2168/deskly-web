# Admin Shared Components

This folder contains reusable admin-composite UI building blocks used across admin routes.

## Components

- `AdminPageHeader`
- `AdminPanel`
- `AdminFilterPanel`
- `AdminFormPage`
- `AdminModal`
- `IconActionButton`
- `LoadingState`
- `ErrorState`
- `EmptyState`

## Usage Rules

- Use `components/ui/*` for low-level controls (`Badge`, `DataTable`, `PaginationControls`).
- Use `components/admin/shared/*` for repeated admin page shells and interaction scaffolding.
- Keep page-specific domain behavior (API calls, transitions, form state) in each route file.
- Keep existing prop names stable on existing components. Only additive optional props are allowed.

## Do / Don't

- Do replace repeated page hero sections with `AdminPageHeader`.
- Do replace repeated filter wrappers with `AdminFilterPanel`.
- Do replace repeated loading/error wrappers with `LoadingState` and `ErrorState`.
- Do use `AdminModal` for consistent dialog shell structure.
- Don't introduce new UI libraries for this phase.
- Don't rename existing props on shared primitives.
- Don't move files unless migration requires it and the move is explicitly justified.

## Migration Checklist

1. Replace page header shell with `AdminPageHeader`.
2. Replace filter shell with `AdminFilterPanel` when applicable.
3. Replace repeated loading/error sections with shared state components.
4. Replace repeated modal shell with `AdminModal`.
5. Centralize duplicated formatter and status-variant helpers under `lib/admin-ui`.
6. Validate behavior parity on list, detail, filter, and action flows.
