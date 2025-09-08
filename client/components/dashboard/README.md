# Dashboard Architecture

This directory contains the refactored dashboard components that follow the Single Responsibility Principle and provide a clean, maintainable architecture for role-specific dashboards.

## Architecture Overview

The dashboard system is built using a **role-based component loader pattern** with the following structure:

```
/client/pages/Dashboard.tsx (main container)
/client/components/dashboard/
├── JobSeekerDashboard.tsx
├── RecruiterDashboard.tsx
├── EmployerDashboard.tsx
├── AdminDashboard.tsx
├── shared/
│   ├── MetricCard.tsx
│   ├── ActivityFeed.tsx
│   ├── OnboardingProgress.tsx
│   └── QuickActions.tsx
└── index.ts

/client/hooks/dashboard/
├── useDashboard.ts
├── useOnboarding.ts
└── index.ts
```

## Components

### Main Container

- **Dashboard.tsx**: Lightweight container component that routes to role-specific dashboards based on user permissions

### Role-Specific Components

- **JobSeekerDashboard.tsx**: Profile stats, application stats, job matches, interviews, messages, career progress
- **RecruiterDashboard.tsx**: Candidate pipeline, job posting stats, recruitment metrics, scheduled interviews
- **EmployerDashboard.tsx**: Team metrics, budget stats, company stats, candidate pipeline, performance summaries
- **AdminDashboard.tsx**: Platform stats, revenue stats, system health, support metrics, feature usage

### Shared Components

- **MetricCard.tsx**: Reusable metric display cards with loading states and trend indicators
- **ActivityFeed.tsx**: Activity timeline component with customizable actions
- **OnboardingProgress.tsx**: Progress tracking for setup tasks with completion states
- **QuickActions.tsx**: Role-based quick action buttons with dynamic content

### Custom Hooks

- **useDashboard.ts**: Centralized dashboard data fetching and state management
- **useOnboarding.ts**: Onboarding task progress calculations and utilities

## Key Features

### 1. **Role-Based Routing**

The main Dashboard container automatically routes users to their appropriate dashboard based on role permissions:

```typescript
if (rolePermissions.isJobSeeker) {
  return <JobSeekerDashboard dashboardData={dashboardData} />;
}
```

### 2. **Shared Component Library**

Common UI patterns are extracted into reusable components:

```typescript
import { MetricGrid, ActivityFeed, OnboardingProgress } from "./shared";
```

### 3. **Custom Hooks for Data Management**

Dashboard data fetching and state management is centralized:

```typescript
const { dashboardData, loading, error, refreshDashboard } = useDashboard();
```

### 4. **Type Safety**

All components use proper TypeScript interfaces matching the backend DTOs:

```typescript
interface JobSeekerDashboardProps {
  dashboardData: JobSeekerDashboard;
  loading?: boolean;
  onRefresh?: () => void;
}
```

### 5. **Loading States & Error Handling**

Consistent loading states and error handling across all components:

```typescript
if (loading) return <LoadingSkeleton />;
if (error) return <ErrorAlert error={error} onRetry={refreshDashboard} />;
```

## Benefits

### ✅ **Maintainability**

- Each role has its own focused component
- Shared logic is extracted into reusable components
- Clear separation of concerns

### ✅ **Testability**

- Individual role dashboards can be tested in isolation
- Shared components have focused, testable responsibilities
- Custom hooks can be unit tested separately

### ✅ **Scalability**

- Easy to add new roles by creating new dashboard components
- Shared components can be enhanced without affecting role-specific logic
- New features can be added to specific roles without impacting others

### ✅ **Performance**

- Code splitting opportunities for role-specific components
- Reduced bundle size through targeted imports
- Efficient re-rendering with focused component boundaries

### ✅ **Developer Experience**

- Clear file organization and naming conventions
- Consistent patterns across all dashboard components
- Easy to locate and modify role-specific functionality

## Usage Examples

### Adding a New Role Dashboard

1. Create new component: `NewRoleDashboard.tsx`
2. Add role check in main Dashboard container
3. Import and use shared components as needed

### Adding New Shared Component

1. Create component in `shared/` directory
2. Export from `shared/index.ts`
3. Import and use in role-specific dashboards

### Customizing Role-Specific Features

Each role dashboard is self-contained and can be modified independently without affecting other roles.

## Migration Notes

This refactored architecture replaces the previous monolithic Dashboard.tsx (1,400+ lines) with:

- 1 lightweight container (280 lines)
- 4 focused role components (300-400 lines each)
- 4 reusable shared components (50-100 lines each)
- 2 custom hooks (50-100 lines each)

All existing functionality has been preserved while dramatically improving code organization and maintainability.
