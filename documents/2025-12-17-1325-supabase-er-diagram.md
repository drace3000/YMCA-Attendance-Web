# Supabase ER Diagram (Current Schema)

**Last Updated:** 2025-01-XX  
**Includes:** All migrations through 20251216

## Full Entity Relationship Diagram

```mermaid
erDiagram
    branches {
        uuid id PK
        text code UK
        text name
        text address
        text city
        text state
        text zip
        text phone
        text description
        timestamptz created_at
    }

    schedules {
        uuid id PK
        text name
        date month_start UK
        text status
        uuid cloned_from_id FK
        timestamptz published_at
        timestamptz created_at
    }

    classes {
        uuid id PK
        uuid branch_id FK
        text name UK
        text description
        text category
        boolean is_active
        timestamptz created_at
    }

    locations {
        uuid id PK
        text code UK
        text name
        boolean is_active
        timestamptz created_at
    }

    instructors {
        uuid id PK
        uuid branch_id FK
        uuid auth_user_id FK
        text raw_name
        text first_name
        text last_name
        text nickname
        smallint pin UK
        boolean is_active
        timestamptz last_login_at
        timestamptz created_at
    }

    instructor_branches {
        uuid id PK
        uuid instructor_id FK
        uuid branch_id FK
        boolean is_primary
        timestamptz created_at
    }

    class_sessions {
        uuid id PK
        uuid schedule_id FK
        uuid class_id FK
        uuid location_id FK
        uuid branch_id FK
        text day_of_week
        time start_time
        time end_time
        date session_date
        date effective_month
        text original_time_text
        integer headcount
        timestamptz headcount_submitted_at
        timestamptz headcount_updated_at
        boolean manager_approved
        timestamptz manager_approved_at
        timestamptz created_at
    }

    session_instructors {
        uuid session_id PK_FK
        uuid instructor_id PK_FK
    }

    Notifications {
        uuid id PK
        text header
        text title
        text notification
        bytea image
        bytea image_bytes
        timestamptz created_at
        timestamptz updated_at
    }

    todos {
        uuid id PK
        uuid user_id FK
        text title
        text description
        boolean completed
        timestamptz created_at
        timestamptz updated_at
    }

    %% Branch relationships
    branches ||--o{ instructors : "primary branch"
    branches ||--o{ instructor_branches : "branch assignments"
    branches ||--o{ class_sessions : "session branch"
    branches ||--o{ classes : "class branch"

    %% Schedule relationships
    schedules ||--o{ class_sessions : "contains"
    schedules ||--o| schedules : "cloned from"

    %% Class session relationships
    classes ||--o{ class_sessions : "class type"
    locations ||--o{ class_sessions : "held at"

    %% Instructor relationships
    instructors ||--o{ instructor_branches : "works at"
    instructors ||--o{ session_instructors : "teaches"

    %% Session instructor link
    class_sessions ||--o{ session_instructors : "taught by"
```

## Simplified View (Core Scheduling)

```mermaid
erDiagram
    branches ||--o{ class_sessions : has
    schedules ||--o{ class_sessions : contains
    classes ||--o{ class_sessions : type
    locations ||--o{ class_sessions : location
    instructors ||--o{ session_instructors : teaches
    class_sessions ||--o{ session_instructors : assigned

    branches {
        uuid id PK
        text name
    }

    schedules {
        uuid id PK
        text name
        date month_start
        text status
    }

    classes {
        uuid id PK
        text name
        boolean is_active
    }

    locations {
        uuid id PK
        text code
        text name
    }

    instructors {
        uuid id PK
        text nickname
        boolean is_active
    }

    class_sessions {
        uuid id PK
        uuid schedule_id FK
        uuid class_id FK
        uuid location_id FK
        uuid branch_id FK
        date session_date
        integer headcount
    }

    session_instructors {
        uuid session_id PK_FK
        uuid instructor_id PK_FK
    }
```

## Relationship Flow

```mermaid
flowchart LR
    subgraph ref [Reference Data]
        B[branches]
        C[classes]
        L[locations]
        I[instructors]
    end

    subgraph schedule [Scheduling]
        S[schedules]
        CS[class_sessions]
    end

    subgraph junction [Junction]
        IB[instructor_branches]
        SI[session_instructors]
    end

    B --> C
    B --> I
    B --> CS
    B --> IB

    S --> CS
    C --> CS
    L --> CS

    I --> IB
    I --> SI
    CS --> SI
```

## Key Relationships

| From | To | Cardinality | Delete Behavior |
|------|-----|-------------|-----------------|
| `branches` | `classes` | 1:N | (default) |
| `branches` | `instructors` | 1:N | SET NULL |
| `branches` | `class_sessions` | 1:N | SET NULL |
| `schedules` | `class_sessions` | 1:N | CASCADE |
| `classes` | `class_sessions` | 1:N | RESTRICT |
| `locations` | `class_sessions` | 1:N | RESTRICT |
| `instructors` | `session_instructors` | 1:N | CASCADE |
| `class_sessions` | `session_instructors` | 1:N | CASCADE |
| `instructors` | `instructor_branches` | 1:N | CASCADE |
| `branches` | `instructor_branches` | 1:N | CASCADE |

## Notes

- All tables use UUID primary keys with `gen_random_uuid()` default
- Soft delete implemented via `is_active` column on: `instructors`, `classes`, `locations`
- `class_sessions` references cannot be deleted if sessions exist (RESTRICT)
- `schedules` deletion cascades to all associated sessions
- `session_date` enables tracking individual occurrences within a schedule
- `branch_id` on `class_sessions` and `classes` enables multi-branch support

## See Also

- [Full Schema Documentation](2025-12-14-1148-supabase-schema-documentation.md) - Complete table definitions
- [Database Documentation](2025-12-14-1148-supabase-database-documentation.md) - Setup and usage
- [Environment Flow](2025-12-14-1148-supabase-environment-flow.md) - Dev/staging/prod workflow
