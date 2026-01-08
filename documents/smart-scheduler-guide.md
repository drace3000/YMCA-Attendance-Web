## Smart Scheduler — User Guide

### Overview
Smart Scheduler is used to manage schedules and class sessions by **Branch** and **Program Group**, then export or print schedules.

### Key Concepts
- **Branch**: a YMCA location (e.g., Eastside Family YMCA).
- **Program Group**: a category such as **Group Exercise (GroupX)**, Aquatics, Wellness, etc.
- **Schedule**: a month for a specific **Branch + Program Group**.
- **Sessions**: the individual class rows under a schedule.

### Prerequisites (one-time setup)
- **Program Groups are global**:
  - Create/manage global groups in **Maintenance → Groups**
- **Branches enable groups**:
  - Enable/disable groups for a branch in **Settings → Program Groups**
  - For Eastside, **GroupX is enabled by default** (current test DB)

### Using Smart Scheduler (daily workflow)
1. **Select Branch**
   - Choose the branch you are scheduling for.
2. **Select Group**
   - Choose the Program Group (defaults to **GroupX** when enabled).
3. **Select Schedule**
   - Choose the schedule month for the selected branch + group.
4. **Find sessions**
   - Use **Search** + filter mode (**Narrow / Find / Smart**)
   - Filter by **Day / Class / Location / Instructor**
   - Use **Week Start** and **Date** to narrow results
5. **Edit a session**
   - Click the pencil icon to edit the row
   - Change start/end time, class, location, instructors, and/or headcount
   - Save (check) or cancel (X)

### Export / Print
- **Export to Excel**: exports sessions for the current selection.
- **Print Schedule**: opens the PDF modal:
  - Preview / Download / Print
  - Buttons stay disabled until sessions for the current selection are fully loaded
  - The PDF header includes the **Program Group name** (e.g., “Group Exercise (GroupX) Schedule”)
  - **Important**: the PDF uses the **current grid context**, so filters/search (example: Instructor search = “Carol”) will produce a report matching what you see in the grid.

### Troubleshooting
- **No groups in the Group dropdown**
  - Enable groups in **Settings → Program Groups** for that branch.
- **No schedules available**
  - Ensure a schedule exists for the selected branch + group.
- **No sessions**
  - The schedule may be empty; confirm sessions exist for that month.


