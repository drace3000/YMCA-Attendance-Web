# Supabase ER Diagram (dev/staging/prod schema baseline)

```mermaid
erDiagram
  branches {
    uuid id PK
    text code
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
    date month_start
    text status
    timestamptz published_at
    timestamptz created_at
  }

  classes {
    uuid id PK
    text name
    text description
    text category
    timestamptz created_at
  }

  locations {
    uuid id PK
    text code
    text name
    timestamptz created_at
  }

  instructors {
    uuid id PK
    uuid branch_id FK
    text raw_name
    text first_name
    text last_name
    text nickname
    numeric pin
    uuid auth_user_id
    timestamptz last_login_at
    timestamptz created_at
  }

  instructor_branches {
    uuid instructor_id FK
    uuid branch_id FK
    boolean is_primary
  }

  schedules ||--o{ class_sessions : "schedule_id"
  branches  ||--o{ class_sessions : "id -> schedule branch via location?"
  classes   ||--o{ class_sessions : "class_id"
  locations ||--o{ class_sessions : "location_id"

  class_sessions {
    uuid id PK
    uuid schedule_id FK
    uuid class_id FK
    uuid location_id FK
    text day_of_week
    time start_time
    time end_time
    text original_time_text
    date effective_month
    integer headcount
    timestamptz headcount_submitted_at
    timestamptz headcount_updated_at
    boolean manager_approved
    timestamptz manager_approved_at
    timestamptz created_at
  }

  instructors ||--o{ instructor_branches : "instructor_id"
  branches    ||--o{ instructor_branches : "branch_id"

  class_sessions ||--o{ session_instructors : "session_id"
  instructors    ||--o{ session_instructors : "instructor_id"

  session_instructors {
    uuid session_id FK
    uuid instructor_id FK
  }

  %% Optional attendance table (if separated from class_sessions headcount)
  class_sessions ||--o{ attendance_records : "class_session_id"
  attendance_records {
    uuid id PK
    uuid class_session_id FK
    integer headcount
    text notes
    timestamptz submitted_at
    boolean approved
    timestamptz approved_at
    timestamptz created_at
  }

  %% Optional conflicts table (from workflow diagram)
  schedules ||--o{ schedule_conflicts : "schedule_id"
  class_sessions ||--o{ schedule_conflicts : "session_id"
  schedule_conflicts {
    uuid id PK
    uuid schedule_id FK
    uuid session_id FK
    text conflict_type
    text description
    timestamptz created_at
  }

  %% Optional notifications table (mentioned in docs)
  notifications {
    uuid id PK
    uuid profile_id FK
    text title
    text body
    timestamptz created_at
    boolean read
  }
```

Notes:
- Keys/relationships reflect the baseline schema from `supabase/migrations/20251212_baseline.sql` and project documentation.
- `attendance_records`, `schedule_conflicts`, and `notifications` are included as optional tables referenced in the PRD/workflow diagrams; adjust to match the live schema if they differ.
- For the most accurate view, you can also visualize via a DB client (e.g., DBeaver/pgAdmin) using the local dev database started by `supabase start` (host `127.0.0.1`, port `54322`, user/password `postgres`). 







