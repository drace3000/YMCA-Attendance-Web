<!--
Generated from YMCA_Attendance_Scheduling_PRD.docx using mammoth + turndown.
Images (if any) extracted to: documents/media
-->
# YMCA Class Attendance & Scheduling System

For the Eastside Family YMCA

Prepared by Donald Race

Advised by Nicholas Race

## Product Requirements Document December 5, 2015

Version 1.0 (prepared December 5, 2025)

**TABLE OF CONTENTS**

| **Section** | **Title** |
| --- | --- |
| 1 | Executive Summary |
| 2 | Problem Statement |
| 3 | Project Objectives |
| 4 | User Personas |
| 5 | MVP Scope |
| 6 | Functional Requirements |
| 7 | Scheduling |
| 8 | Attendance |
| 9 | KPI Requirements |
| 10 | Reporting & Exports |
| 11 | Data Model Overview |
| 12 | User Stories |
| 13 | Non-Functional Requirements |
| 14 | Release Roadmap |
| Appendix A | KPI Definitions |
| Appendix B | Wireframe Placeholders |
| Appendix C | Data Dictionary (High Level) |
| Appendix D | Release Roadmap Detail |
| Appendix E | User Flows |
| Appendix F | Future Enhancements |

# Executive Summary

The proposed YMCA Class Attendance & Scheduling System is a digital platform that replaces spreadsheet-based attendance workflows with a unified mobile and web solution. The system includes an Instructor Mobile App and Manager app Dashboard. It supports future multi-branch operations, real-time attendance capture, and automated KPI reporting. The MVP delivery target is 3–4 weeks for the initial pilot branch at the Eastside Family YMCA, while the architecture is designed for future nationwide rollout.

# Problem Statement

Branches currently rely on spreadsheets and manual processes to manage class schedules, instructor activity, and attendance counts. This approach leads to inconsistent data, missing or duplicated entries, limited historical analysis, and heavy administrative workload for instructors and managers. Leadership lacks timely and reliable insights into class performance, member engagement, and instructor utilization.

# Project Objectives

The primary objectives of this project are to: **(1)** digitize attendance and scheduling; **(2)** standardize data collection across branches; **(3)** reduce manual administrative work; **(4)** improve reporting accuracy and timeliness; **(5)** provide managers and leadership with actionable KPIs; and **(6)** establish a scalable foundation for national deployment.

# User Personas

**Instructor:** Teaches scheduled classes, needs quick mobile attendance entry, and the ability to edit submissions until optional manager approval. Requires rapid attendance entry, mobile-first workflow, edit-before-approval capability.

**Manager:** Oversees schedules, instructors, and attendance performance; requires web and mobile access to dashboards, approvals, KPIs, and exports. Requires scheduling tools, approvals, Key Performance Indicators (KPI) dashboard, exports, and real-time visibility.

# MVP Scope

**Included:** Instructor app, manager app, dashboard, scheduling, attendance, approvals (optional), KPI reporting, exports, database backend.

**Excluded:** Member roster tracking, payments, online registration, waivers.

# Functional Requirements

**Instructor Mobile App**

• Secure login using instructor email of choice. • Daily schedule view listing upcoming classes by time, location, and type with email notification reminders. • Headcount-only attendance entry with optional notes. • Draft and Submit class attendance with ability to edit until approval (optional). • Prevention of duplicate submissions for the same scheduled class.

**Manager Mobile App**

• View and edit daily schedule and attendance summaries. • Approve or return instructor submissions (optional). • Quick KPI cards such as total attendance today and average per class. • Access to instructor-level summaries.

**Manager Web Dashboard**

• Create and manage class schedules by date, time, branch, class type, and assigned instructor. • Review attendance logs; filter by date, instructor, class type, or branch. • Approve or request corrections when approval workflow is enabled. • View KPI dashboards with monthly totals, averages, and instructor utilization. • Export reports in PDF and Excel formats.

# Scheduling Requirements

Branch managers define class schedules including branch, class type, class group (if used), instructor, start time, end time, and recurrence. The system must support one-off sessions and recurring patterns (e.g., every Tuesday/Thursday at 6 PM). Instructors can be assigned across branches and classes.

# Attendance Requirements

Attendance is captured as a single numeric headcount for each scheduled class instance. The instructor enters the total number of participants and may add an optional note. A single attendance record per class per date is enforced. Records progress through Draft → Submitted → Approved states when the approval workflow is enabled.

# KPI Requirements

The system computes KPIs aligned to the example of the November 2025 worksheet, including:

-   **Monthly Totals:** attendance, classes held, average attendance.
-   **Class Type Averages:** Yoga, Cardio, Strength, etc.
-   **Class Group Averages:** AOA, Senior, Youth.
-   **Instructor Utilization:** classes taught vs assigned.
-   **Trends:** daily, weekly, monthly.

# Reporting Requirements

**Exports:** Monthly summary, class type averages, group averages, instructor summaries, daily/weekly attendance. PDF reports include charts, tables, summaries, and performance insights.

# Data Model

**Database Tables:** Users, Branches, Instructors\_branches, Class\_types, Class\_groups, Class\_schedule, Attendance\_logs. Supports multi-branch operations, scalable reporting, and secure role-based access.

# User Stories

**Instructor:**

• As an instructor, I want to record attendance quickly, via the app, so I can complete it during or immediately after class.

• As an instructor, I want to edit my attendance entry until it has been approved.

**Manager:**

• As a branch manager, I want to build and maintain class schedules so that instructors always know what they are responsible for. Ability to craft and schedule instructor email notifications.

• As a branch manager, I want to approve attendance submissions so that reported numbers are reliable (optional).

• As a branch manager, I want KPI dashboards and exports so that I can prepare monthly reports efficiently.

# Non-Functional Requirements

**Performance:** submissions <2 seconds.

**Security:** Row-level access.

**Scalability:** nationwide enabled.

**Reliability:** >99% uptime.

# Release Roadmap

**Phase 1 (3–4 Weeks):** Instructor app, manager app, scheduling, attendance, approvals, basic reporting.

**Phase 2:** KPI dashboards, enhanced analytics.

**Phase 3:** National dashboards, AI forecasting.

# Appendices

**Appendix A – KPI Definitions**

This appendix formally defines each KPI, including:

• **Monthly Attendance Total** = Sum of all approved attendance headcounts in the selected month.

**• Average Attendance per Class** = Monthly Attendance Total ÷ Number of classes held.

**• Class Type Average =** Total attendance for a given class type ÷ Number of sessions of that type.

**• Class Group Average =** Total attendance for a class group ÷ Number of sessions in that group.

**• Instructor Utilization =** (Number of classes taught by instructor ÷ Number of classes assigned) × 100.

**• Trend Metrics =** Attendance values aggregated by day, week, or month, compared over time.

# Appendix B – Wireframe Placeholders

Wireframe placeholders describe the intended layout of key screens:

**• Instructor Daily Schedule –** List of classes by time with a call-to-action to enter attendance.

**• Instructor Attendance Entry –** Simple form with headcount field, optional notes, and Submit/Draft controls. • Manager Mobile Dashboard – KPI cards, pending approvals list, and today's schedule.

**• Manager Web Dashboard –** Tabbed layout for KPIs, schedule, attendance logs, and exports.

# Appendix C – Data Dictionary (High Level)

**Key entities:**

• **users:** id, name, email, role (instructor, manager).

**• branches:** id, name, region.

• **instructors\_branches:** instructor\_id, branch\_id.

• **class\_types:** id, name.

**• class\_groups:** id, name.

• **class\_schedule:** id, branch\_id, class\_type\_id, group\_id, instructor\_id, start\_time, end\_time, recurrence.

• **attendance\_logs:** id, schedule\_id, instructor\_id, headcount, notes, status, created\_on.

A full technical data dictionary can be produced as a follow-on artifact.

# Appendix D – Release Roadmap Detail

-   **Phase 1 (3–4 Weeks):** Focus on core flows—scheduling, attendance entry, approvals, and export of basic reports.
-   Phase 2 (5-7 Weeks): KPI dashboards, time-series analytics, and richer exports.
-   Phase 3 (8–12 Weeks): National dashboards, benchmarking across branches, and advanced optimization features

# Appendix E – User Flows

**Instructor Flow:**

-   Login
-   View today's classes
-   Select class
-   Enter headcount
-   Add notes (optional)
-   Save as Draft or Submit → (If enabled) Manager Approval → Record marked as Approved.

**Manager Flow:**

-   Login
-   Manage Instructor Schedule
-   Manage Classes
-   View dashboard attendance KPIs →
-   Approve or Return for edit Instructor attendance submission (optional)→
-   Export monthly reports as needed
