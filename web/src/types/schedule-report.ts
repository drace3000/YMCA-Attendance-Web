/**
 * Type definitions for Schedule Report generation
 * Used by PDF/Excel generators and related components
 */

/**
 * Branch information for report header/footer
 */
export interface ReportBranch {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website_url?: string;
  schedule_email_from?: string;
  schedule_email_reply_to?: string;
}

/**
 * Schedule metadata
 */
export interface ReportSchedule {
  id: string;
  name: string;
  month_start: string;
}

/**
 * Session data formatted for report generation
 */
export interface ReportSession {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  class_name: string;
  location_code: string;
  location_name: string;
  instructors: string[];
}

/**
 * Location entry for the legend/key
 */
export interface ReportLocation {
  code: string;
  name: string;
}

/**
 * Complete data structure for generating a schedule report
 */
export interface ScheduleReportData {
  branch: ReportBranch;
  schedule: ReportSchedule;
  sessions: ReportSession[];
  locations: ReportLocation[];
  generatedAt: Date;
}

/**
 * Supported report output formats
 */
export type ReportFormat = 'pdf' | 'excel';

/**
 * Auxiliary email recipient (non-instructor)
 */
export interface ScheduleRecipient {
  id: string;
  branch_id: string;
  email: string;
  name?: string;
  created_at: string;
}

/**
 * Email distribution request payload
 */
export interface EmailDistributionRequest {
  schedule_id: string;
  branch_id: string;
  recipient_emails: string[];
  subject?: string;
  message?: string;
}












