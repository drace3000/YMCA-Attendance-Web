# Product Requirements Document
# YMCA Monthly Schedule Report Generator

**Version:** 1.0  
**Date:** December 17, 2024  
**Author:** Claude (Opus 4.5)  
**Project:** YMCA Branch Management System  
**Feature:** Automated Monthly Group Fitness Schedule PDF Generation & Distribution

---

## 1. Executive Summary

This document defines requirements for automatically generating and distributing formatted PDF schedule reports when a branch manager publishes a monthly group fitness schedule. The system will create a print-ready, two-column weekly schedule matching the existing YMCA format, and distribute it to instructors via email while making it available for download and printing.

### Business Value
- **Consistency**: Standardized schedule format across all branches
- **Efficiency**: Eliminates manual schedule formatting (saves 2-3 hours per month per branch)
- **Timeliness**: Instant distribution to instructors upon publication
- **Accessibility**: Multiple distribution channels (email, download, print)

---

## 2. Goals & Objectives

| Goal | Success Metric |
|------|----------------|
| Automate schedule PDF generation | 100% of published schedules auto-generate PDF |
| Match existing format exactly | Visual comparison approval from stakeholders |
| Reduce distribution time | < 5 minutes from publish to instructor emails sent |
| Ensure print quality | 300 DPI output suitable for posting |
| Track distribution | 100% of email sends logged with status |

---

## 3. User Stories

### Branch Manager
> As a branch manager, I want the schedule PDF to generate automatically when I publish so I don't have to manually create it in Excel.

> As a branch manager, I want to email the schedule to all my instructors with one click so I can quickly communicate changes.

> As a branch manager, I want to download and print the schedule so I can post it at the front desk and in studios.

### Instructor
> As an instructor, I want to receive the new schedule via email when it's published so I know my upcoming classes.

> As an instructor, I want to download the schedule from the app so I can reference it on my phone.

---

## 4. Functional Requirements

### 4.1 Output Format Selection

Managers can generate the monthly schedule in three formats:

| Format | Extension | Best For | Features |
|--------|-----------|----------|----------|
| **PDF** | `.pdf` | Printing, posting, archival | Print-ready, consistent layout, universal viewing |
| **Excel** | `.xlsx` | Editing, custom sorting, data manipulation | Editable, filterable, can add notes |
| **Word** | `.docx` | Custom editing, adding announcements | Editable text, add custom content |

#### 4.1.1 Format Selection UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Generate Monthly Schedule                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Select Output Format:                                                  │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │   📄 PDF        │  │   📊 Excel      │  │   📝 Word       │         │
│  │                 │  │                 │  │                 │         │
│  │  Best for       │  │  Best for       │  │  Best for       │         │
│  │  printing &     │  │  editing &      │  │  adding custom  │         │
│  │  posting        │  │  filtering      │  │  announcements  │         │
│  │                 │  │                 │  │                 │         │
│  │  [● Selected]   │  │  [○ Select]     │  │  [○ Select]     │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [  Generate Schedule  ]                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Report Layout Specification

The schedule report uses a **two-column weekly layout** matching the existing YMCA Excel format. This layout applies to all three output formats (PDF, Excel, Word).

#### 4.2.1 Page Structure

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              [HEADER SECTION]                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                           [YMCA LOGO]                                    │   │
│  │                                                                          │   │
│  │                    GROUP FITNESS SCHEDULE                                │   │
│  │                    [Branch Name]                                         │   │
│  │                    [Month Year]                                          │   │
│  │                                                                          │   │
│  │                    Effective: [Start Date]                               │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│                              [SCHEDULE GRID]                                    │
│  ┌──────────────────────────────────┬──────────────────────────────────────┐   │
│  │         LEFT COLUMN              │          RIGHT COLUMN                │   │
│  │  Saturday                        │  Wednesday                           │   │
│  │  Sunday                          │  Thursday                            │   │
│  │  Monday                          │  Friday                              │   │
│  │  Tuesday                         │                                      │   │
│  └──────────────────────────────────┴──────────────────────────────────────┘   │
│                                                                                 │
│                              [FOOTER SECTION]                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  LOCATION KEY:                                                           │   │
│  │  (S) = Studio  (MB) = Mind/Body  (C) = Cycle  (SPC) = Specialty         │   │
│  │  (LP) = Lap Pool  (EP) = Exercise Pool  (FP) = Family Pool              │   │
│  │  (FG) = Fitness Gallery                                                  │   │
│  │                                                                          │   │
│  │  Schedule subject to change. Visit [website] for updates.                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 4.2.2 Column Layout

| Left Column (Position 1) | Right Column (Position 2) |
|--------------------------|---------------------------|
| SATURDAY | WEDNESDAY |
| SUNDAY | THURSDAY |
| MONDAY | FRIDAY |
| TUESDAY | *(empty or overflow)* |

#### 4.2.3 Class Entry Format

Each class session displays in the following format:

```
┌────────────────────────────────────┐
│  TIME          CLASS NAME   (LOC)  │
│                INSTRUCTOR          │
└────────────────────────────────────┘

Example:
┌────────────────────────────────────┐
│  7:15-7:45am   GRIT-CARDIO™  (SPC) │
│                MIKEY               │
└────────────────────────────────────┘

Example with multiple instructors:
┌────────────────────────────────────┐
│  9:30-10:30am  BODYPUMP™      (S)  │
│                JENN W./ROBERT      │
└────────────────────────────────────┘
```

#### 4.2.4 Day Header Format

```
┌────────────────────────────────────┐
│           SATURDAY                 │  ← Bold, ALL CAPS, shaded background
├────────────────────────────────────┤
│  7:15-7:45am   GRIT-CARDIO™  (SPC) │
│                MIKEY               │
│  8:00-9:00am   BODYPUMP™      (S)  │
│                JENN W.             │
└────────────────────────────────────┘
```

### 4.3 Format-Specific Specifications

#### 4.3.1 PDF Format (.pdf)

| Property | Value |
|----------|-------|
| Page Size | Letter (8.5" x 11") |
| Orientation | Landscape |
| Margins | 0.5" all sides |
| Resolution | 300 DPI (print-ready) |
| Font Embedding | Yes (for consistent rendering) |
| Compression | Optimized for reasonable file size |

**PDF-Specific Features:**
- Read-only format (cannot be edited)
- Ideal for printing and posting
- Consistent display across all devices
- Smallest file size

#### 4.3.2 Excel Format (.xlsx)

| Property | Value |
|----------|-------|
| Page Setup | Landscape, fit to 1 page wide |
| Print Area | Auto-set to schedule content |
| Header Row | Frozen for scrolling |
| Column Widths | Auto-fit to content |

**Excel Workbook Structure:**

| Sheet | Content |
|-------|---------|
| **Schedule** | Main two-column weekly layout |
| **Class List** | All classes sorted by day/time (filterable table) |
| **Instructor Summary** | Classes per instructor |
| **Raw Data** | Flat data for pivot tables |

**Sheet 1: Schedule (Visual Layout)**
- Mirrors the PDF two-column layout
- Merged cells for headers
- YMCA branding colors applied
- Print-ready page setup

**Sheet 2: Class List (Data Table)**
- Auto-filter enabled on all columns
- Sortable by any column
- Columns: Day, Time, Class Name, Location, Instructor(s)
- Conditional formatting for visual appeal

**Excel-Specific Features:**
- Fully editable by recipient
- Can add notes, highlight changes
- Filter by day, instructor, location
- Create custom views
- Add/remove classes before distributing

#### 4.3.3 Word Format (.docx)

| Property | Value |
|----------|-------|
| Page Size | Letter (8.5" x 11") |
| Orientation | Landscape |
| Margins | 0.5" all sides |
| Columns | Two-column layout using Word tables |

**Word Document Structure:**
- YMCA Logo header
- Title and branch information
- **Editable Announcements Section** (placeholder for manager notes)
- Two-column schedule table
- Location key footer

**Word-Specific Features:**
- Editable text and tables
- Placeholder for announcements/notes
- Can add custom branding per branch
- Track changes support
- Comments can be added
- Ideal for adding "Special this month" sections

---

### 4.4 Data Mapping

#### 4.2.1 Source Tables

| Report Element | Database Table | Column |
|----------------|----------------|--------|
| Branch Name | `branches` | `name` |
| Schedule Month | `schedules` | `name` or formatted `month_start` |
| Effective Date | `schedules` | `month_start` |
| Day of Week | `class_sessions` | `day_of_week` |
| Start Time | `class_sessions` | `start_time` |
| End Time | `class_sessions` | `end_time` |
| Class Name | `classes` | `name` |
| Location Code | `locations` | `code` |
| Location Description | `locations` | `legend_description` |
| Instructor Name | `instructors` | `nickname` |

#### 4.2.2 Data Query

```sql
-- Main query to fetch all schedule data for PDF generation
SELECT 
    cs.id as session_id,
    cs.day_of_week,
    cs.start_time,
    cs.end_time,
    c.name as class_name,
    l.code as location_code,
    STRING_AGG(i.nickname, '/' ORDER BY i.nickname) as instructors
FROM class_sessions cs
JOIN classes c ON cs.class_id = c.id
JOIN locations l ON cs.location_id = l.id
LEFT JOIN session_instructors si ON cs.id = si.session_id
LEFT JOIN instructors i ON si.instructor_id = i.id AND i.is_active = TRUE
WHERE cs.schedule_id = :schedule_id
  AND cs.branch_id = :branch_id
GROUP BY 
    cs.id, 
    cs.day_of_week, 
    cs.start_time, 
    cs.end_time, 
    c.name, 
    l.code
ORDER BY 
    CASE cs.day_of_week
        WHEN 'Saturday' THEN 1
        WHEN 'Sunday' THEN 2
        WHEN 'Monday' THEN 3
        WHEN 'Tuesday' THEN 4
        WHEN 'Wednesday' THEN 5
        WHEN 'Thursday' THEN 6
        WHEN 'Friday' THEN 7
    END,
    cs.start_time;
```

```sql
-- Query for location legend
SELECT code, legend_description 
FROM locations 
WHERE is_active = TRUE 
ORDER BY code;
```

```sql
-- Query for branch and schedule info
SELECT 
    b.name as branch_name,
    b.code as branch_code,
    s.name as schedule_name,
    s.month_start,
    s.status
FROM schedules s
JOIN branches b ON s.id = :schedule_id
WHERE s.id = :schedule_id;
```

### 4.3 Formatting Specifications

#### 4.3.1 Typography

| Element | Font | Size | Style | Color |
|---------|------|------|-------|-------|
| Title "GROUP FITNESS SCHEDULE" | Arial Black | 24pt | Bold | YMCA Blue (#0047AB) |
| Branch Name | Arial | 18pt | Bold | Black |
| Month/Year | Arial | 16pt | Regular | Black |
| Effective Date | Arial | 11pt | Italic | Gray (#666666) |
| Day Header | Arial | 14pt | Bold | White on Blue (#0047AB) |
| Time | Arial | 10pt | Regular | Black |
| Class Name | Arial | 10pt | Bold | Black |
| Location Code | Arial | 9pt | Regular | Gray (#666666) |
| Instructor | Arial | 9pt | Regular | Black |
| Location Key Title | Arial | 10pt | Bold | Black |
| Location Key Items | Arial | 9pt | Regular | Black |
| Disclaimer | Arial | 8pt | Italic | Gray (#888888) |

#### 4.3.2 Page Layout

| Property | Value |
|----------|-------|
| Page Size | Letter (8.5" x 11") |
| Orientation | Landscape |
| Margins | Top: 0.5", Bottom: 0.5", Left: 0.5", Right: 0.5" |
| Column Width | 3.75" each |
| Column Gap | 0.25" |
| Header Height | 1.25" |
| Footer Height | 0.75" |

#### 4.3.3 Colors

| Element | Color | Hex Code |
|---------|-------|----------|
| YMCA Blue (Primary) | Blue | #0047AB |
| Day Header Background | Blue | #0047AB |
| Day Header Text | White | #FFFFFF |
| Alternating Row (optional) | Light Gray | #F5F5F5 |
| Grid Lines | Light Gray | #CCCCCC |
| Body Text | Black | #000000 |
| Secondary Text | Dark Gray | #666666 |

#### 4.3.4 Time Formatting Rules

| Input | Output Format | Example |
|-------|---------------|---------|
| 07:15:00, 07:45:00 | h:mm-h:mmam | 7:15-7:45am |
| 12:45:00, 13:30:00 | h:mm-h:mmpm | 12:45-1:30pm |
| 17:30:00, 18:30:00 | h:mm-h:mmpm | 5:30-6:30pm |

```javascript
function formatTimeRange(startTime, endTime) {
  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const period = h >= 12 ? 'pm' : 'am';
    const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayHour}:${minutes}`;
  };
  
  const start = formatTime(startTime);
  const end = formatTime(endTime);
  const endHour = parseInt(endTime.split(':')[0]);
  const period = endHour >= 12 ? 'pm' : 'am';
  
  return `${start}-${end}${period}`;
}
```

#### 4.3.5 Class Name Formatting Rules

| Rule | Example Input | Example Output |
|------|---------------|----------------|
| Preserve trademark symbols | BODYPUMP™ | BODYPUMP™ |
| Preserve registered symbols | ZUMBA® | ZUMBA® |
| ALL CAPS for class names | bodypump | BODYPUMP |
| Preserve mixed case brands | Les Mills RPM™ | Les Mills RPM™ |

### 4.4 Generation Trigger

#### 4.4.1 Automatic Generation

The PDF generation triggers automatically when:
- `schedules.status` changes from any value to `'published'`

```typescript
// Database trigger or application event handler
async function onScheduleStatusChange(
  scheduleId: string, 
  oldStatus: string, 
  newStatus: string
) {
  if (newStatus === 'published' && oldStatus !== 'published') {
    await generateAndStoreSchedulePDF(scheduleId);
    
    // Optional: Auto-email to instructors
    const settings = await getBranchSettings(branchId);
    if (settings.auto_email_on_publish) {
      await emailScheduleToInstructors(scheduleId);
    }
  }
}
```

#### 4.4.2 Manual Regeneration

Branch managers can manually regenerate the PDF:
- Button: "Regenerate PDF" on schedule detail page
- Use case: After making corrections to a published schedule

### 4.7 Post-Generation Workflow

After the schedule document is generated, the manager is presented with a **Distribution Hub** screen offering multiple options:

#### 4.7.1 Distribution Hub UI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ✓ Schedule Generated Successfully                                              │
│                                                                                 │
│  January 2025 Schedule - Downtown YMCA                                          │
│  Format: PDF  |  Size: 245 KB  |  Generated: Dec 17, 2024 2:30 PM              │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                         │   │
│  │                     [DOCUMENT PREVIEW]                                  │   │
│  │                                                                         │   │
│  │     ┌─────────────────────────────────────────────────────────────┐    │   │
│  │     │                                                             │    │   │
│  │     │              GROUP FITNESS SCHEDULE                         │    │   │
│  │     │              Downtown YMCA                                  │    │   │
│  │     │              January 2025                                   │    │   │
│  │     │                                                             │    │   │
│  │     │   SATURDAY              │   WEDNESDAY                       │    │   │
│  │     │   7:15-7:45am GRIT...   │   5:30-6:00am GRIT...            │    │   │
│  │     │   ...                   │   ...                             │    │   │
│  │     │                                                             │    │   │
│  │     └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                         │   │
│  │                        Page 1 of 1                                      │   │
│  │                  [◀ Prev]  [Next ▶]  [🔍 Zoom]                         │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  What would you like to do?                                                     │
│                                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐          │
│  │  📧 Email to      │  │  🖨️ Print        │  │  💾 Download      │          │
│  │  Instructors      │  │                   │  │                   │          │
│  │                   │  │  Send to printer  │  │  Save to device   │          │
│  │  Send to 24       │  │  for posting      │  │                   │          │
│  │  instructors      │  │                   │  │                   │          │
│  │                   │  │                   │  │                   │          │
│  │  [ Send Now ]     │  │  [ Print ]        │  │  [ Download ]     │          │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘          │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  [  Generate Different Format  ]    [  Close  ]                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 4.7.2 On-Screen Preview

| Feature | Details |
|---------|---------|
| Preview Type | Embedded document viewer |
| PDF Preview | Native browser PDF viewer or PDF.js |
| Excel Preview | Rendered HTML table view (read-only) |
| Word Preview | Rendered HTML view (read-only) |
| Zoom | 50%, 75%, 100%, 125%, 150%, Fit to Width |
| Pagination | Navigate multi-page documents |
| Full Screen | Expand preview to full browser window |

**Preview Implementation by Format:**

| Format | Preview Method | Library |
|--------|----------------|---------|
| PDF | Browser native or PDF.js | `pdfjs-dist` |
| Excel | HTML table rendering | `sheetjs` preview mode |
| Word | HTML conversion | `mammoth.js` |

#### 4.7.3 Print Functionality

| Feature | Details |
|---------|---------|
| Trigger | "Print" button opens system print dialog |
| PDF | Direct print via `window.print()` or PDF viewer |
| Excel | Print-optimized HTML version or open in Excel |
| Word | Print-optimized HTML version or open in Word |
| Paper Size | Auto-detected from document (Letter, Landscape) |
| Quality | Uses 300 DPI source for sharp output |

**Print Options Modal (Optional Advanced)**
```
┌─────────────────────────────────────────────────┐
│  Print Schedule                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  Copies: [1 ▼]                                  │
│                                                 │
│  ☑ Include location key                        │
│  ☑ Include header with logo                    │
│  ☐ Print in grayscale                          │
│                                                 │
│  [Cancel]              [Print]                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4.8 Distribution Methods

#### 4.8.1 Download from Application

| Requirement | Details |
|-------------|---------|
| Access Point | Distribution Hub → "Download" button |
| Authorization | Branch managers, instructors assigned to branch |

**File Naming Convention:**
| Format | Pattern | Example |
|--------|---------|---------|
| PDF | `{BranchCode}_Schedule_{MonthYear}.pdf` | `DT_Schedule_January2025.pdf` |
| Excel | `{BranchCode}_Schedule_{MonthYear}.xlsx` | `DT_Schedule_January2025.xlsx` |
| Word | `{BranchCode}_Schedule_{MonthYear}.docx` | `DT_Schedule_January2025.docx` |

#### 4.8.2 Email Distribution

**Recipients**
- All active instructors linked to the branch via `instructor_branches`

**Query for Recipients**
```sql
SELECT DISTINCT
    i.id,
    i.first_name,
    i.nickname,
    u.email
FROM instructors i
JOIN instructor_branches ib ON i.id = ib.instructor_id
JOIN auth.users u ON i.auth_user_id = u.id
WHERE ib.branch_id = :branch_id
  AND i.is_active = TRUE
  AND i.auth_user_id IS NOT NULL;
```

**Email Specifications**

| Property | Value |
|----------|-------|
| From | `noreply@ymca.org` (configurable) |
| Subject | `[Branch Name] Group Fitness Schedule - [Month Year]` |
| Attachment | PDF, Excel, or Word file (based on selection) |
| Max attachment size | 10MB |

**Supported Attachment Formats:**
| Format | MIME Type | Notes |
|--------|-----------|-------|
| PDF | `application/pdf` | Default, most compatible |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Editable by recipients |
| Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Editable by recipients |

**Email Template**
```html
Subject: Downtown YMCA Group Fitness Schedule - January 2025

<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  
  <div style="background-color: #0047AB; color: white; padding: 20px; text-align: center;">
    <img src="[YMCA_LOGO_URL]" alt="YMCA" style="height: 50px;">
    <h1 style="margin: 10px 0 0 0;">Group Fitness Schedule</h1>
  </div>
  
  <div style="padding: 20px;">
    <p>Hi {{instructor_first_name}},</p>
    
    <p>The <strong>{{month_year}}</strong> group fitness schedule has been 
    published for <strong>{{branch_name}}</strong>.</p>
    
    <p>Please review the attached schedule for your class assignments. 
    If you have any questions or need to request changes, contact your 
    Group Fitness Coordinator.</p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="{{schedule_url}}" 
         style="background-color: #0047AB; color: white; padding: 12px 24px; 
                text-decoration: none; border-radius: 4px; display: inline-block;">
        View Schedule Online
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px;">
      You can also download the schedule from the YMCA app or view it 
      posted at the facility.
    </p>
  </div>
  
  <div style="background-color: #f5f5f5; padding: 15px; text-align: center; 
              font-size: 12px; color: #666;">
    <p>{{branch_name}}<br>
    {{branch_address}}<br>
    {{branch_phone}}</p>
    <p>You're receiving this because you're a registered instructor at this location.</p>
  </div>
  
</body>
</html>
```

**Plain Text Version**
```
Hi {{instructor_first_name}},

The {{month_year}} group fitness schedule has been published for {{branch_name}}.

Please review the attached schedule for your class assignments. If you have 
any questions or need to request changes, contact your Group Fitness Coordinator.

View online: {{schedule_url}}

Thank you,
{{branch_name}} Group Fitness Team

---
{{branch_address}}
{{branch_phone}}
```

#### 4.5.3 Print-Ready Output

| Requirement | Details |
|-------------|---------|
| Resolution | 300 DPI |
| Color Mode | CMYK-compatible (RGB acceptable for office printing) |
| Bleed | None (standard office printing) |
| Crop Marks | None |
| Paper | Letter size, landscape |
| Recommended Print | Color laser or high-quality inkjet |

### 4.6 Storage

#### 4.6.1 Supabase Storage Configuration

| Setting | Value |
|---------|-------|
| Bucket Name | `schedule-reports` |
| Access | Private (signed URLs) |
| Path Pattern | `{branch_id}/{schedule_id}/schedule.{ext}` |
| URL Expiration | 1 hour for download links |

**Supported Extensions:**
- `.pdf` - PDF format
- `.xlsx` - Excel format  
- `.docx` - Word format

**Storage Policy**
```sql
-- Allow authenticated users to read their branch's schedules
CREATE POLICY "Branch users can download schedules"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'schedule-reports' AND
  (storage.foldername(name))[1] IN (
    SELECT branch_id::text FROM instructor_branches 
    WHERE instructor_id IN (
      SELECT id FROM instructors WHERE auth_user_id = auth.uid()
    )
  )
);
```

#### 4.6.2 Retention Policy

| Scenario | Retention |
|----------|-----------|
| Current/Published schedules | Indefinite |
| Archived schedules | 12 months |
| Draft schedules | No PDF generated |

---

## 5. Database Schema

### 5.1 Schema Modifications

```sql
-- Add PDF tracking columns to schedules table
ALTER TABLE schedules 
ADD COLUMN pdf_storage_path TEXT,
ADD COLUMN pdf_generated_at TIMESTAMPTZ,
ADD COLUMN pdf_file_size INTEGER;

-- Add legend description to locations for PDF key
ALTER TABLE locations 
ADD COLUMN legend_description TEXT;

-- Populate location legend descriptions
UPDATE locations SET legend_description = 'Studio' WHERE code = 'S';
UPDATE locations SET legend_description = 'Mind/Body Room' WHERE code = 'MB';
UPDATE locations SET legend_description = 'Cycle Room' WHERE code = 'C';
UPDATE locations SET legend_description = 'Specialty' WHERE code = 'SPC';
UPDATE locations SET legend_description = 'Lap Pool' WHERE code = 'LP';
UPDATE locations SET legend_description = 'Exercise Pool' WHERE code = 'EP';
UPDATE locations SET legend_description = 'Family Pool' WHERE code = 'FP';
UPDATE locations SET legend_description = 'Fitness Gallery' WHERE code = 'FG';

-- Add email configuration to branches (optional)
ALTER TABLE branches
ADD COLUMN schedule_email_from TEXT DEFAULT 'noreply@ymca.org',
ADD COLUMN schedule_email_reply_to TEXT,
ADD COLUMN auto_email_on_publish BOOLEAN DEFAULT TRUE,
ADD COLUMN website_url TEXT;
```

### 5.2 New Tables

```sql
-- Track schedule distribution history
CREATE TABLE schedule_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    distribution_type TEXT NOT NULL CHECK (distribution_type IN ('email', 'download', 'print')),
    recipient_email TEXT,
    recipient_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    recipient_name TEXT,
    initiated_by UUID REFERENCES auth.users(id),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    error_message TEXT,
    email_provider_id TEXT,  -- e.g., SendGrid message ID
    opened_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_schedule_dist_schedule ON schedule_distributions(schedule_id);
CREATE INDEX idx_schedule_dist_branch ON schedule_distributions(branch_id);
CREATE INDEX idx_schedule_dist_status ON schedule_distributions(status);
CREATE INDEX idx_schedule_dist_sent ON schedule_distributions(sent_at DESC);

-- RLS
ALTER TABLE schedule_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers can view distributions"
ON schedule_distributions FOR SELECT
USING (
    branch_id IN (
        SELECT branch_id FROM instructor_branches ib
        JOIN instructors i ON ib.instructor_id = i.id
        WHERE i.auth_user_id = auth.uid()
    )
);
```

---

## 6. Technical Architecture

### 6.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Application                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Schedule Detail │  │ PDF Download    │  │ Email Schedule      │  │
│  │ Page            │  │ Button          │  │ Modal               │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │              │
│           ▼                    ▼                      ▼              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    API Layer                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ generate-schedule-  │  │ email-schedule      │                   │
│  │ pdf                 │  │                     │                   │
│  │                     │  │ - Fetch PDF         │                   │
│  │ - Query data        │  │ - Get recipients    │                   │
│  │ - Build PDF         │  │ - Send via provider │                   │
│  │ - Store in bucket   │  │ - Log distribution  │                   │
│  └──────────┬──────────┘  └──────────┬──────────┘                   │
│             │                        │                               │
│             ▼                        ▼                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Supabase Storage                           │   │
│  │                    (schedule-reports bucket)                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    External Services                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                   │
│  │ Email Provider      │  │ (Future)            │                   │
│  │ (SendGrid/Resend)   │  │ SMS Provider        │                   │
│  └─────────────────────┘  └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/schedules/{id}/generate` | POST | Generate schedule in specified format | Manager |
| `/api/schedules/{id}/report` | GET | Download report (signed URL) | Manager, Instructor |
| `/api/schedules/{id}/preview` | GET | Get preview data for rendering | Manager, Instructor |
| `/api/schedules/{id}/email` | POST | Email to all/selected instructors | Manager |
| `/api/schedules/{id}/email/{instructorId}` | POST | Email to specific instructor | Manager |
| `/api/schedules/{id}/distributions` | GET | Get distribution history | Manager |

**Generate Endpoint Request Body:**
```typescript
POST /api/schedules/{id}/generate
{
  format: 'pdf' | 'xlsx' | 'docx',
  options?: {
    includeAnnouncementsPlaceholder?: boolean,  // Word only
    includeRawDataSheet?: boolean,              // Excel only
    grayscale?: boolean                         // All formats
  }
}
```

**Generate Endpoint Response:**
```typescript
{
  success: true,
  format: 'pdf',
  storagePath: 'branch-123/schedule-456/schedule.pdf',
  downloadUrl: 'https://...signed-url...',
  previewUrl: 'https://...preview-url...',
  fileSize: 245000,
  generatedAt: '2024-12-17T14:30:00Z'
}
```

### 6.3 Edge Function: generate-schedule-pdf

```typescript
// /supabase/functions/generate-schedule-pdf/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { scheduleId } = await req.json()
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // 1. Fetch schedule and branch info
  const { data: schedule } = await supabase
    .from('schedules')
    .select(`
      *,
      branches:branch_id (*)
    `)
    .eq('id', scheduleId)
    .single()
  
  // 2. Fetch all sessions for this schedule
  const { data: sessions } = await supabase
    .rpc('get_schedule_sessions_for_pdf', { p_schedule_id: scheduleId })
  
  // 3. Fetch location legend
  const { data: locations } = await supabase
    .from('locations')
    .select('code, legend_description')
    .eq('is_active', true)
    .order('code')
  
  // 4. Generate PDF
  const pdfBuffer = await generatePDF({
    schedule,
    sessions,
    locations
  })
  
  // 5. Upload to storage
  const storagePath = `${schedule.branch_id}/${scheduleId}/schedule.pdf`
  await supabase.storage
    .from('schedule-reports')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true
    })
  
  // 6. Update schedule record
  await supabase
    .from('schedules')
    .update({
      pdf_storage_path: storagePath,
      pdf_generated_at: new Date().toISOString(),
      pdf_file_size: pdfBuffer.byteLength
    })
    .eq('id', scheduleId)
  
  return new Response(JSON.stringify({ success: true, path: storagePath }))
})
```

### 6.4 PDF Generation Implementation

Using **ReportLab** (Python) or **pdfkit/puppeteer** (Node.js):

```typescript
// /src/lib/reports/schedule-pdf-generator.ts

import PDFDocument from 'pdfkit';

interface ScheduleSession {
  day_of_week: string;
  start_time: string;
  end_time: string;
  class_name: string;
  location_code: string;
  instructors: string;
}

interface PDFGeneratorOptions {
  branchName: string;
  scheduleName: string;
  effectiveDate: string;
  sessions: ScheduleSession[];
  locations: { code: string; legend_description: string }[];
  logoUrl?: string;
}

export async function generateSchedulePDF(options: PDFGeneratorOptions): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'landscape',
    margins: { top: 36, bottom: 36, left: 36, right: 36 }
  });

  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

  // Colors
  const YMCA_BLUE = '#0047AB';
  const WHITE = '#FFFFFF';
  const GRAY = '#666666';

  // Page dimensions (landscape letter)
  const pageWidth = 792;  // 11 inches
  const pageHeight = 612; // 8.5 inches
  const contentWidth = pageWidth - 72; // minus margins
  const columnWidth = (contentWidth - 18) / 2; // 18px gap

  // === HEADER ===
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor(YMCA_BLUE)
     .text('GROUP FITNESS SCHEDULE', 36, 36, { align: 'center', width: contentWidth });

  doc.fontSize(18)
     .font('Helvetica-Bold')
     .fillColor('black')
     .text(options.branchName, 36, 65, { align: 'center', width: contentWidth });

  doc.fontSize(16)
     .font('Helvetica')
     .text(options.scheduleName, 36, 88, { align: 'center', width: contentWidth });

  doc.fontSize(11)
     .font('Helvetica-Oblique')
     .fillColor(GRAY)
     .text(`Effective: ${options.effectiveDate}`, 36, 110, { align: 'center', width: contentWidth });

  // === SCHEDULE GRID ===
  const gridTop = 140;
  const leftColumnX = 36;
  const rightColumnX = 36 + columnWidth + 18;

  // Group sessions by day
  const dayOrder = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const leftDays = ['Saturday', 'Sunday', 'Monday', 'Tuesday'];
  const rightDays = ['Wednesday', 'Thursday', 'Friday'];

  const sessionsByDay = groupBy(options.sessions, 'day_of_week');

  let leftY = gridTop;
  let rightY = gridTop;

  // Render left column
  for (const day of leftDays) {
    leftY = renderDaySection(doc, day, sessionsByDay[day] || [], leftColumnX, leftY, columnWidth);
  }

  // Render right column
  for (const day of rightDays) {
    rightY = renderDaySection(doc, day, sessionsByDay[day] || [], rightColumnX, rightY, columnWidth);
  }

  // === FOOTER / LEGEND ===
  const footerY = pageHeight - 70;
  
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor('black')
     .text('LOCATION KEY:', 36, footerY);

  const legendItems = options.locations
    .map(l => `(${l.code}) = ${l.legend_description}`)
    .join('   ');

  doc.fontSize(9)
     .font('Helvetica')
     .text(legendItems, 36, footerY + 14, { width: contentWidth });

  doc.fontSize(8)
     .font('Helvetica-Oblique')
     .fillColor(GRAY)
     .text('Schedule subject to change. Check website for updates.', 36, footerY + 32, { 
       align: 'center', 
       width: contentWidth 
     });

  doc.end();

  return Buffer.concat(buffers);
}

function renderDaySection(
  doc: PDFKit.PDFDocument, 
  day: string, 
  sessions: ScheduleSession[], 
  x: number, 
  y: number,
  width: number
): number {
  // Day header
  doc.rect(x, y, width, 20).fill('#0047AB');
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#FFFFFF')
     .text(day.toUpperCase(), x + 5, y + 5, { width: width - 10 });

  y += 22;

  // Sessions
  doc.fillColor('black');
  for (const session of sessions) {
    const timeStr = formatTimeRange(session.start_time, session.end_time);
    
    // Time and class name row
    doc.fontSize(10)
       .font('Helvetica')
       .text(timeStr, x + 5, y, { continued: true, width: 80 })
       .font('Helvetica-Bold')
       .text(`  ${session.class_name}`, { continued: true })
       .font('Helvetica')
       .fillColor('#666666')
       .text(`  (${session.location_code})`, { continued: false });

    y += 12;

    // Instructor row
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('black')
       .text(session.instructors, x + 85, y);

    y += 14;
  }

  return y + 10; // Add spacing before next day
}

function formatTimeRange(start: string, end: string): string {
  // Implementation from section 4.3.4
}

function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const group = String(item[key]);
    (result[group] = result[group] || []).push(item);
    return result;
  }, {} as Record<string, T[]>);
}
```

---

## 7. Email Integration

### 7.1 Email Provider Options

| Provider | Pros | Cons | Recommended |
|----------|------|------|-------------|
| **Resend** | Simple API, good DX, built for devs | Newer, smaller | ✓ For startups |
| **SendGrid** | Mature, reliable, good analytics | Complex setup | ✓ For enterprise |
| **Postmark** | Great deliverability | Higher cost | For transactional |
| **AWS SES** | Cheapest at scale | Complex setup | For high volume |

### 7.2 Edge Function: email-schedule

```typescript
// /supabase/functions/email-schedule/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

serve(async (req) => {
  const { scheduleId, instructorId } = await req.json()
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Get schedule and branch info
  const { data: schedule } = await supabase
    .from('schedules')
    .select(`
      *,
      branches:branch_id (*)
    `)
    .eq('id', scheduleId)
    .single()

  // 2. Get PDF from storage
  const { data: pdfData } = await supabase.storage
    .from('schedule-reports')
    .download(schedule.pdf_storage_path)

  // 3. Get recipients
  let recipientQuery = supabase
    .from('instructors')
    .select(`
      id,
      first_name,
      nickname,
      auth_user_id,
      auth:auth_user_id (email)
    `)
    .eq('is_active', true)

  if (instructorId) {
    recipientQuery = recipientQuery.eq('id', instructorId)
  } else {
    recipientQuery = recipientQuery.in('id', 
      supabase.from('instructor_branches')
        .select('instructor_id')
        .eq('branch_id', schedule.branch_id)
    )
  }

  const { data: recipients } = await recipientQuery

  // 4. Send emails
  const results = []
  for (const recipient of recipients) {
    try {
      const emailResult = await resend.emails.send({
        from: schedule.branches.schedule_email_from || 'noreply@ymca.org',
        to: recipient.auth.email,
        subject: `${schedule.branches.name} Group Fitness Schedule - ${schedule.name}`,
        html: generateEmailHTML({
          instructorName: recipient.first_name || recipient.nickname,
          branchName: schedule.branches.name,
          monthYear: schedule.name,
          scheduleUrl: `${Deno.env.get('APP_URL')}/schedules/${scheduleId}`
        }),
        attachments: [{
          filename: `${schedule.branches.code}_Schedule_${schedule.name.replace(' ', '')}.pdf`,
          content: Buffer.from(await pdfData.arrayBuffer()).toString('base64')
        }]
      })

      // Log success
      await supabase.from('schedule_distributions').insert({
        schedule_id: scheduleId,
        branch_id: schedule.branch_id,
        distribution_type: 'email',
        recipient_email: recipient.auth.email,
        recipient_instructor_id: recipient.id,
        recipient_name: recipient.nickname,
        status: 'sent',
        email_provider_id: emailResult.id
      })

      results.push({ instructor: recipient.id, status: 'sent' })
    } catch (error) {
      // Log failure
      await supabase.from('schedule_distributions').insert({
        schedule_id: scheduleId,
        branch_id: schedule.branch_id,
        distribution_type: 'email',
        recipient_email: recipient.auth?.email,
        recipient_instructor_id: recipient.id,
        status: 'failed',
        error_message: error.message
      })

      results.push({ instructor: recipient.id, status: 'failed', error: error.message })
    }
  }

  return new Response(JSON.stringify({ results }))
})
```

---

## 8. User Interface

### 8.1 Schedule Detail Page Additions

```tsx
// /src/components/SchedulePDFActions.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Mail, RefreshCw, Loader2 } from 'lucide-react';

interface SchedulePDFActionsProps {
  scheduleId: string;
  status: 'draft' | 'published' | 'archived';
  pdfGeneratedAt?: string;
  onEmailSent?: () => void;
}

export function SchedulePDFActions({ 
  scheduleId, 
  status, 
  pdfGeneratedAt,
  onEmailSent 
}: SchedulePDFActionsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const handleDownload = async () => {
    const response = await fetch(`/api/schedules/${scheduleId}/pdf`);
    const { url } = await response.json();
    window.open(url, '_blank');
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    await fetch(`/api/schedules/${scheduleId}/generate-pdf`, { method: 'POST' });
    setIsGenerating(false);
  };

  const handleEmailAll = async () => {
    setIsEmailing(true);
    await fetch(`/api/schedules/${scheduleId}/email`, { method: 'POST' });
    setIsEmailing(false);
    onEmailSent?.();
  };

  if (status !== 'published') {
    return (
      <div className="text-sm text-gray-500">
        PDF will be generated when schedule is published.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={handleDownload} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Download PDF
        </Button>

        <Button onClick={() => setShowEmailModal(true)} variant="outline">
          <Mail className="w-4 h-4 mr-2" />
          Email to Instructors
        </Button>

        <Button 
          onClick={handleRegenerate} 
          variant="ghost"
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Regenerate
        </Button>
      </div>

      {pdfGeneratedAt && (
        <p className="text-xs text-gray-500">
          Last generated: {new Date(pdfGeneratedAt).toLocaleString()}
        </p>
      )}

      <EmailScheduleModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        scheduleId={scheduleId}
        onSend={handleEmailAll}
        isSending={isEmailing}
      />
    </div>
  );
}
```

### 8.2 Email Confirmation Modal

```tsx
// /src/components/EmailScheduleModal.tsx

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface EmailScheduleModalProps {
  open: boolean;
  onClose: () => void;
  scheduleId: string;
  onSend: () => void;
  isSending: boolean;
}

export function EmailScheduleModal({
  open,
  onClose,
  scheduleId,
  onSend,
  isSending
}: EmailScheduleModalProps) {
  const { data: instructors } = useInstructorsForBranch();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Email Schedule to Instructors</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-600 mb-4">
            The schedule PDF will be sent to the following instructors:
          </p>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            <label className="flex items-center gap-2 font-medium">
              <Checkbox 
                checked={selectAll}
                onCheckedChange={(checked) => {
                  setSelectAll(!!checked);
                  setSelectedIds(checked ? instructors.map(i => i.id) : []);
                }}
              />
              Select All ({instructors?.length || 0})
            </label>
            
            <hr className="my-2" />

            {instructors?.map(instructor => (
              <label key={instructor.id} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.includes(instructor.id)}
                  onCheckedChange={(checked) => {
                    setSelectedIds(prev => 
                      checked 
                        ? [...prev, instructor.id]
                        : prev.filter(id => id !== instructor.id)
                    );
                  }}
                />
                <span>{instructor.nickname}</span>
                <span className="text-gray-400 text-sm">
                  ({instructor.email})
                </span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={onSend} 
            disabled={isSending || selectedIds.length === 0}
          >
            {isSending ? 'Sending...' : `Send to ${selectedIds.length} Instructors`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 9. Environment Variables

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Provider (choose one)
RESEND_API_KEY=re_xxxxxxxxxxxxx
# or
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx

# Application
APP_URL=https://your-app.com
DEFAULT_FROM_EMAIL=noreply@ymca.org

# Optional: YMCA Branding
YMCA_LOGO_URL=https://your-cdn.com/ymca-logo.png
```

---

## 10. Files to Create

```
# Database Migrations
/supabase/migrations/YYYYMMDD_schedule_pdf_columns.sql
/supabase/migrations/YYYYMMDD_schedule_distributions.sql
/supabase/migrations/YYYYMMDD_location_legend.sql

# Edge Functions
/supabase/functions/generate-schedule-report/index.ts    # Unified generator for all formats
/supabase/functions/email-schedule/index.ts
/supabase/functions/get-schedule-report/index.ts

# Report Generation - Core
/src/lib/reports/schedule-report-generator.ts            # Main orchestrator
/src/lib/reports/schedule-data-fetcher.ts                # Data fetching logic
/src/lib/reports/time-formatter.ts                       # Time formatting utilities

# Report Generation - Format-Specific
/src/lib/reports/formats/schedule-pdf-generator.ts       # PDF generation (reportlab/pdfkit)
/src/lib/reports/formats/schedule-excel-generator.ts     # Excel generation (exceljs)
/src/lib/reports/formats/schedule-word-generator.ts      # Word generation (docx)
/src/lib/reports/formats/index.ts                        # Format factory

# Report Styling
/src/lib/reports/styles/schedule-styles.ts               # Shared style constants
/src/lib/reports/styles/ymca-branding.ts                 # Logo, colors, fonts

# Email
/src/lib/email/schedule-email-template.ts
/src/lib/email/email-provider.ts

# UI Components
/src/components/schedule/GenerateScheduleModal.tsx       # Format selection modal
/src/components/schedule/DistributionHub.tsx             # Post-generation actions
/src/components/schedule/SchedulePreview.tsx             # Document preview component
/src/components/schedule/EmailScheduleModal.tsx          # Email confirmation modal
/src/components/schedule/PrintScheduleButton.tsx         # Print trigger
/src/components/schedule/DistributionHistory.tsx         # History view

# Hooks
/src/hooks/useScheduleReport.ts                          # Generate/fetch reports
/src/hooks/useDocumentPreview.ts                         # Preview rendering
/src/hooks/useEmailSchedule.ts                           # Email distribution
/src/hooks/usePrintDocument.ts                           # Print functionality

# Types
/src/types/schedule-report.ts
```

---

## 11. Testing Requirements

### 11.1 Unit Tests

| Test | Description |
|------|-------------|
| `formatTimeRange()` | Verify AM/PM formatting for all time combinations |
| `groupSessionsByDay()` | Verify correct day grouping and ordering |
| `generateEmailHTML()` | Verify template variable substitution |

### 11.2 Integration Tests

| Test | Description |
|------|-------------|
| PDF Generation | Generate PDF and verify page count, dimensions |
| Storage Upload | Verify PDF uploads to correct bucket/path |
| Email Send | Verify email sends with correct attachment |
| Distribution Logging | Verify database records created |

### 11.3 Visual Tests

| Test | Description |
|------|-------------|
| Layout Comparison | Compare generated PDF to sample Excel visually |
| Print Test | Print PDF and verify readability |
| Mobile View | Verify email renders correctly on mobile |

---

## 12. Acceptance Criteria

### 12.1 Format Selection
- [ ] Manager can select PDF, Excel, or Word format before generating
- [ ] Default format is PDF
- [ ] Format selection UI clearly explains use case for each format

### 12.2 PDF Generation
- [ ] PDF generates with correct two-column weekly layout
- [ ] PDF is landscape orientation, letter size
- [ ] PDF is print-ready at 300 DPI
- [ ] YMCA branding (logo, colors) applied
- [ ] Location key legend at bottom

### 12.3 Excel Generation
- [ ] Excel generates with visual Schedule sheet (matches PDF layout)
- [ ] Excel includes filterable Class List sheet
- [ ] Excel includes Instructor Summary sheet
- [ ] Excel includes Raw Data sheet for pivot tables
- [ ] Auto-filter enabled on data sheets
- [ ] Print setup configured for landscape

### 12.4 Word Generation
- [ ] Word generates with two-column table layout
- [ ] Word includes editable Announcements placeholder section
- [ ] YMCA branding applied
- [ ] Document is fully editable

### 12.5 Preview & Display
- [ ] Generated document displays on screen immediately
- [ ] Preview supports zoom (50% - 150%)
- [ ] Preview shows page count for multi-page documents
- [ ] Full-screen preview option available

### 12.6 Print Functionality
- [ ] Print button opens system print dialog
- [ ] Print maintains correct layout and orientation
- [ ] Print quality matches 300 DPI source

### 12.7 Download
- [ ] Download button saves file to user's device
- [ ] File name follows naming convention
- [ ] Correct file extension for selected format

### 12.8 Email Distribution
- [ ] Email sends to all active branch instructors
- [ ] Email includes correct file attachment (PDF, Excel, or Word)
- [ ] Email uses branded template with personalization
- [ ] Manager can select/deselect individual instructors
- [ ] Distribution history logged in database
- [ ] Failed sends logged with error message

### 12.9 Layout Accuracy (All Formats)
- [ ] Left column contains: Saturday, Sunday, Monday, Tuesday
- [ ] Right column contains: Wednesday, Thursday, Friday
- [ ] Sessions sorted by time within each day
- [ ] Multiple instructors displayed with "/" separator
- [ ] Location codes in parentheses (e.g., "(SPC)")
- [ ] Trademark symbols preserved (™, ®)

---

## 13. Performance Requirements

| Metric | Target |
|--------|--------|
| PDF Generation Time | < 5 seconds |
| PDF File Size | < 500KB |
| Email Send (per recipient) | < 2 seconds |
| Total Distribution (20 instructors) | < 60 seconds |

---

## 14. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Unauthorized PDF access | Signed URLs with 1-hour expiration |
| Email spoofing | SPF/DKIM/DMARC configured for sending domain |
| Data exposure | RLS policies on all tables |
| Rate limiting | Max 100 emails per schedule per hour |

---

## 15. Future Enhancements

| Feature | Priority | Description |
|---------|----------|-------------|
| SMS notification | Medium | Text instructors when schedule published |
| Schedule comparison | Medium | Highlight changes from previous month |
| Instructor portal | Low | Self-service schedule viewing for instructors |
| Public web page | Low | Embeddable schedule widget for YMCA website |
| Multiple formats | Low | Also generate PNG image for social media |

---

**Document Status**: Complete and ready for implementation  
**Dependencies**: Main PRD Natural Language Query Feature (for shared infrastructure)
