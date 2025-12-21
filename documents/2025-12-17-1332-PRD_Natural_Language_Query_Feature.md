# Product Requirements Document
# YMCA Attendance Tracking System - Natural Language Query Feature

**Version:** 1.0  
**Date:** December 16, 2024  
**Author:** Claude (Opus 4.5)  
**Project:** YMCA Branch Management System  
**Feature:** AI-Powered Natural Language Database Queries

---

## 1. Executive Summary

This document defines requirements for adding natural language query capabilities to the YMCA Attendance Tracking System. Branch managers will be able to ask questions about their data in plain English (via text or voice), receive AI-generated SQL queries executed against Supabase, and get results returned as both text and synthesized speech. All queries and results are persisted for future reference and searchability.

### Example Interaction
> **Manager asks:** "I need a branch location that has 30 minute availability outside normally scheduled sessions"
> 
> **System responds:** Generates appropriate SQL, executes against Supabase, returns formatted results on screen, and speaks a summary via ElevenLabs.

---

## 2. Goals & Objectives

| Goal | Success Metric |
|------|----------------|
| Enable non-technical branch managers to query data without SQL knowledge | 90% of common questions answered without manual SQL |
| Reduce time to get operational insights | Query-to-answer in under 10 seconds |
| Provide accessible voice interface | Full voice-in/voice-out capability |
| Build institutional knowledge base | Searchable history of all queries and results |
| Maintain data security | Read-only access, branch-scoped data only |

---

## 3. User Personas

### Primary User: Branch Manager
- **Technical Skill:** Low to moderate; comfortable with web apps but not SQL
- **Use Cases:** 
  - Finding schedule gaps for new classes
  - Analyzing attendance patterns
  - Checking room/instructor availability
  - Generating ad-hoc reports
- **Access Scope:** Data for their assigned branch only
- **Device:** Desktop browser (primary), tablet (secondary)

---

## 4. Functional Requirements

### 4.1 Usage Tracking & Billing

#### 4.1.1 Token-Based Usage Model
| Parameter | Default Value | Configurable |
|-----------|---------------|--------------|
| Monthly token allowance | 50,000 tokens per branch | Yes (admin) |
| Billing cycle | Rolling 30 days | No |
| Overage handling | Hard block at limit | No |
| Notification threshold | 75% of allowance | Yes (admin) |
| Spending cap per manager | $100/month | Yes (branch admin) |
| Unlimited add-on price | $49/month | Yes (admin) |

#### 4.1.2 Token Consumption Tracking
| Action | Token Cost | Notes |
|--------|------------|-------|
| Natural language query | Input tokens + Output tokens | Actual API usage |
| Voice transcription (Whisper) | ~100 tokens per 30 sec audio | Estimated flat rate |
| Voice synthesis (ElevenLabs) | 0 tokens | Not counted against allowance |
| Report generation | 0 tokens | Not counted against allowance |

**Token Calculation**
```typescript
interface TokenUsage {
  query_input_tokens: number;    // Tokens sent to AI (prompt + schema + user query)
  query_output_tokens: number;   // Tokens received from AI (SQL + explanation)
  whisper_tokens: number;        // Estimated tokens for voice transcription
  total_tokens: number;          // Sum of above
}
```

#### 4.1.3 Usage Tracking Database Schema
```sql
-- Branch token allowance and billing settings
CREATE TABLE branch_billing (
    branch_id UUID PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
    monthly_token_allowance INTEGER DEFAULT 50000,
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    tokens_used INTEGER DEFAULT 0,
    unlimited_addon_active BOOLEAN DEFAULT FALSE,
    unlimited_addon_expires TIMESTAMPTZ,
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual usage transactions
CREATE TABLE token_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query_id UUID REFERENCES nl_queries(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    whisper_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER NOT NULL,
    ai_provider TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Manager spending limits
CREATE TABLE manager_spending_limits (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    monthly_spending_cap DECIMAL(10,2) DEFAULT 100.00,
    current_month_spent DECIMAL(10,2) DEFAULT 0.00,
    spending_period_start TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment history
CREATE TABLE payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT NOT NULL,
    stripe_invoice_id TEXT,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'usd',
    payment_type TEXT NOT NULL CHECK (payment_type IN ('unlimited_addon')),
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
    receipt_url TEXT,
    receipt_sent_at TIMESTAMPTZ,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_token_usage_branch ON token_usage_log(branch_id);
CREATE INDEX idx_token_usage_created ON token_usage_log(created_at);
CREATE INDEX idx_token_usage_period ON token_usage_log(branch_id, created_at);
CREATE INDEX idx_payment_history_branch ON payment_history(branch_id);
CREATE INDEX idx_payment_history_user ON payment_history(user_id);

-- RLS Policies
ALTER TABLE branch_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_spending_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Branch managers can view their branch's billing
CREATE POLICY branch_billing_policy ON branch_billing
    FOR SELECT USING (branch_id IN (
        SELECT branch_id FROM user_branch_assignments WHERE user_id = auth.uid()
    ));

-- Users can view their own usage
CREATE POLICY token_usage_policy ON token_usage_log
    FOR SELECT USING (user_id = auth.uid());

-- Users can view their own spending limits
CREATE POLICY spending_limits_policy ON manager_spending_limits
    FOR SELECT USING (user_id = auth.uid());

-- Users can view their own payments
CREATE POLICY payment_history_policy ON payment_history
    FOR SELECT USING (user_id = auth.uid());
```

#### 4.1.4 Usage Check Flow
```
User submits query
       │
       ▼
┌─────────────────────────────────────┐
│ Check: Unlimited add-on active?     │
│ (unlimited_addon_active = true AND  │
│  unlimited_addon_expires > NOW())   │
└─────────────────────────────────────┘
       │
       ├── YES → Proceed with query
       │
       ▼ NO
┌─────────────────────────────────────┐
│ Check: tokens_used < allowance?     │
└─────────────────────────────────────┘
       │
       ├── YES → Proceed with query → Log tokens → Update tokens_used
       │
       ▼ NO
┌─────────────────────────────────────┐
│ HARD BLOCK                          │
│ Show: "Monthly limit reached"       │
│ Show: "Purchase Unlimited" button   │
└─────────────────────────────────────┘
```

#### 4.1.5 Notification System
| Trigger | Notification Type | Message |
|---------|-------------------|---------|
| 75% of allowance used | In-app banner + Email | "Your branch has used 75% of its monthly AI query allowance (37,500 of 50,000 tokens). Consider purchasing unlimited access." |
| 100% reached (blocked) | Modal popup | "Monthly limit reached. Purchase unlimited access for $49 to continue using AI queries this month." |
| Unlimited purchased | Email receipt | "Thank you for your purchase. Unlimited AI queries are now active until [date]." |
| Unlimited expiring (3 days) | Email | "Your unlimited AI access expires in 3 days. Your branch has [X] tokens remaining in the base allowance." |

### 4.2 Stripe Integration

#### 4.2.1 Stripe Configuration
| Setting | Value |
|---------|-------|
| Product | "YMCA AI Query - Unlimited Monthly Add-on" |
| Price | $49.00 USD (one-time, not recurring) |
| Tax handling | Stripe Tax (automatic calculation) |
| Receipts | Automatic email via Stripe |
| Payment methods | Card (Visa, Mastercard, Amex, Discover) |

#### 4.2.2 Stripe Setup Requirements
```javascript
// Stripe Products to Create
const product = {
  name: "AI Query Unlimited Add-on",
  description: "Unlimited AI-powered database queries for 30 days",
  metadata: {
    product_type: "unlimited_addon",
    duration_days: "30"
  }
};

const price = {
  product: product.id,
  unit_amount: 4900,  // $49.00 in cents
  currency: "usd",
  tax_behavior: "exclusive"  // Tax added on top
};
```

#### 4.2.3 Stripe Tax Configuration
| Setting | Value |
|---------|-------|
| Tax calculation | Stripe Tax automatic |
| Tax behavior | Exclusive (added to price) |
| Tax exempt handling | Support certificate upload for exempt orgs |
| Fallback | If tax cannot be determined, proceed without (log for review) |

**Tax Exempt Flow**
```
Branch claims tax exempt
       │
       ▼
Upload tax exemption certificate (PDF)
       │
       ▼
Admin reviews and approves
       │
       ▼
Stripe Customer updated with tax_exempt: "exempt"
       │
       ▼
Future purchases: no tax charged
```

#### 4.2.4 Payment Flow

**Purchase Unlimited Add-on**
```
Manager clicks "Purchase Unlimited"
       │
       ▼
┌─────────────────────────────────────┐
│ Check: spending_cap remaining?      │
│ (monthly_cap - current_spent >= 49) │
└─────────────────────────────────────┘
       │
       ├── NO → Show "Spending limit reached. Contact your administrator."
       │
       ▼ YES
┌─────────────────────────────────────┐
│ Create Stripe Checkout Session      │
│ - customer: branch stripe_customer  │
│ - line_items: unlimited_addon       │
│ - automatic_tax: enabled            │
│ - success_url: /queries?purchased=1 │
│ - cancel_url: /queries              │
└─────────────────────────────────────┘
       │
       ▼
Redirect to Stripe Checkout
       │
       ▼
Payment succeeds
       │
       ▼
Webhook: checkout.session.completed
       │
       ▼
┌─────────────────────────────────────┐
│ Update branch_billing:              │
│ - unlimited_addon_active = true     │
│ - unlimited_addon_expires =         │
│   NOW() + 30 days                   │
│                                     │
│ Update manager_spending_limits:     │
│ - current_month_spent += 49         │
│                                     │
│ Insert payment_history record       │
│                                     │
│ Stripe sends receipt email          │
└─────────────────────────────────────┘
```

#### 4.2.5 Stripe Webhook Events
| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate unlimited, log payment, update spending |
| `payment_intent.payment_failed` | Log failure, notify user |
| `charge.refunded` | Deactivate unlimited if full refund, log refund |
| `customer.tax_id.created` | Update tax exempt status |

#### 4.2.6 Payment Management Popup UI

**Trigger Conditions**
- User clicks "Purchase Unlimited" button
- User hits 100% usage limit (auto-popup)
- User clicks usage indicator showing near-limit

**Popup Layout**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                            [X]  │
│                    Upgrade to Unlimited                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  📊 Current Usage                                          │ │
│  │                                                            │ │
│  │  ████████████████████████░░░░░░  75% used                 │ │
│  │  37,500 / 50,000 tokens                                   │ │
│  │                                                            │ │
│  │  Resets: January 15, 2025 (14 days)                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ✨ Unlimited AI Queries                          $49/mo  │ │
│  │                                                            │ │
│  │  • Unlimited natural language queries                     │ │
│  │  • Unlimited voice input/output                           │ │
│  │  • Unlimited report generation                            │ │
│  │  • Valid for 30 days from purchase                        │ │
│  │                                                            │ │
│  │  Tax: Calculated at checkout                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Your spending this month: $0 of $100 limit                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              [ Purchase Unlimited - $49 ]                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🔒 Secure payment via Stripe                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Blocked State Popup (100% usage)**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                            [X]  │
│                   Monthly Limit Reached                         │
│                                                                 │
│                         ⚠️                                      │
│                                                                 │
│  Your branch has used all 50,000 tokens for this billing       │
│  period. To continue using AI queries, purchase unlimited      │
│  access.                                                        │
│                                                                 │
│  Allowance resets: January 15, 2025 (14 days)                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              [ Purchase Unlimited - $49 ]                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│                    [ Wait for Reset ]                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.2.7 Usage Dashboard Widget
Display on query page header:

```
┌────────────────────────────────────────────────────────┐
│  🔋 37,500 / 50,000 tokens  ████████░░░░  [Upgrade]   │
└────────────────────────────────────────────────────────┘
```

Or when unlimited is active:
```
┌────────────────────────────────────────────────────────┐
│  ✨ Unlimited Active (expires Jan 15)                  │
└────────────────────────────────────────────────────────┘
```

### 4.3 Query Input Interface

#### 4.3.1 Text Input
| Requirement | Details |
|-------------|---------|
| Input method | Single-line text field with multi-line expansion |
| Placeholder text | Dynamic examples: "Try: 'Show me all yoga classes with less than 50% attendance'" |
| Character limit | 500 characters |
| Submit trigger | Enter key or Submit button |
| Loading state | Animated indicator with "Analyzing your question..." text |

#### 4.3.2 Voice Input (Whisper API)
| Requirement | Details |
|-------------|---------|
| Activation | Microphone button adjacent to text input |
| Recording indicator | Pulsing red dot with duration timer |
| Max duration | 60 seconds |
| Audio format | WebM or WAV, sent to OpenAI Whisper API |
| Transcription display | Show transcribed text in input field before submission |
| Edit capability | User can modify transcription before submitting |
| Error handling | Fallback message if mic access denied or transcription fails |

#### 4.3.3 Input Preprocessing
| Requirement | Details |
|-------------|---------|
| Spell correction | AI should interpret minor typos |
| Branch context injection | Automatically scope queries to user's assigned branch |
| Ambiguity detection | AI asks clarifying questions if query is unclear |

---

### 4.4 AI Query Processing

#### 4.4.1 Schema Context Management
| Requirement | Details |
|-------------|---------|
| Schema provision | Full database schema provided to AI in system prompt |
| Table descriptions | Human-readable descriptions of each table's purpose |
| Column annotations | Data types, constraints, and semantic meaning |
| Relationship mapping | Foreign key relationships and join patterns |
| Example queries | 10-15 example natural language → SQL pairs |
| Update mechanism | Schema context refreshed when database migrations occur |

#### 4.4.2 SQL Generation
| Requirement | Details |
|-------------|---------|
| Query type | SELECT statements only (read-only) |
| Prohibited operations | No INSERT, UPDATE, DELETE, DROP, TRUNCATE, or DDL |
| SQL validation | Parse and validate SQL before execution |
| Branch filtering | All queries MUST include WHERE clause for user's branch_id |
| Row limits | Default LIMIT 100; AI can adjust based on question context |
| Timeout | 30 second query timeout |

#### 4.4.3 AI Model Configuration
| Requirement | Details |
|-------------|---------|
| Default Provider | Anthropic API (Claude Opus 4.5) |
| Architecture | Provider-agnostic abstraction layer for easy model switching |
| Temperature | 0.1 (low creativity, high precision for SQL) |
| System prompt structure | See Section 8.1 |
| Response format | Structured JSON with sql, explanation, and result_format fields |

#### 4.4.4 AI Provider Abstraction Layer
The system shall implement a provider-agnostic interface allowing administrators to switch between AI models without code changes.

**Supported Providers (Initial)**
| Provider | Models | Use Case |
|----------|--------|----------|
| Anthropic | claude-opus-4-5-20251101, claude-sonnet-4-5-20250929 | Default, highest quality |
| OpenAI | gpt-4o, gpt-4o-mini | Alternative, cost optimization |

**Configuration via Environment Variables**
```env
# AI Provider Settings
AI_PROVIDER=anthropic                    # anthropic | openai
AI_MODEL=claude-opus-4-5-20251101       # model identifier
AI_TEMPERATURE=0.1                       # 0.0 - 1.0
AI_MAX_TOKENS=4096                       # max response tokens
```

**Provider Interface Contract**
```typescript
interface AIProvider {
  name: string;
  generateSQL(params: {
    userQuery: string;
    schema: string;
    branchId: string;
    examples: string;
  }): Promise<{
    sql: string;
    explanation: string;
    resultFormat: ResultFormat;
    voiceSummaryTemplate: string;
  } | {
    error: string;
    clarificationNeeded?: string;
  }>;
}
```

**Implementation Requirements**
| Requirement | Details |
|-------------|---------|
| Single interface | All providers implement same `AIProvider` interface |
| Factory pattern | `createAIProvider(config)` returns appropriate provider instance |
| Prompt adaptation | Each provider adapter translates base prompt to provider-optimal format |
| Response normalization | All providers return identical response structure |
| Fallback support | Optional secondary provider if primary fails |
| Hot-swappable | Change provider via env var without redeployment (restart required) |
| Logging | Log provider, model, tokens used, and latency for each request |

**Admin Configuration Table (Optional Future Enhancement)**
```sql
-- For runtime model switching without restart
CREATE TABLE ai_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example entries
INSERT INTO ai_configuration (setting_key, setting_value) VALUES
('ai_provider', 'anthropic'),
('ai_model', 'claude-opus-4-5-20251101'),
('ai_temperature', '0.1'),
('ai_fallback_provider', 'openai'),
('ai_fallback_model', 'gpt-4o');
```

---

### 4.5 Query Execution

#### 4.5.1 Supabase Integration
| Requirement | Details |
|-------------|---------|
| Connection | Supabase client with service role key (server-side only) |
| Execution method | `supabase.rpc()` or raw SQL via Edge Function |
| Row-level security | Bypass RLS in Edge Function; enforce branch filter in SQL |
| Error handling | Catch and display user-friendly messages for SQL errors |

#### 4.5.2 Security Controls
| Requirement | Details |
|-------------|---------|
| SQL injection prevention | Parameterized queries where possible; AI-generated SQL validated |
| Query allowlist | Only SELECT with approved functions (COUNT, SUM, AVG, etc.) |
| Blocked keywords | DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, GRANT, EXECUTE |
| Audit logging | All queries logged with user_id, timestamp, SQL, and result count |

---

### 4.6 Results Display

#### 4.6.1 Adaptive Formatting (AI-Determined)
The AI will analyze the query results and select the most appropriate display format:

| Result Type | Display Format | Example Query |
|-------------|----------------|---------------|
| Single value | Large prominent number/text | "How many classes ran last week?" |
| Short list (≤10 rows) | Card layout or simple table | "Show instructors available Monday morning" |
| Tabular data (>10 rows) | Sortable, paginated data table | "List all classes with attendance" |
| Time series | Line or bar chart | "Show attendance trends for yoga classes" |
| Aggregations | Summary cards with breakdown | "Average attendance by class type" |
| Yes/No questions | Clear affirmative/negative with context | "Is Room A available at 2pm Tuesday?" |

#### 4.6.2 Results Panel Components
| Component | Details |
|-----------|---------|
| AI Summary | 2-3 sentence natural language explanation of results |
| Data Display | Formatted per above table |
| SQL Preview | Collapsible panel showing generated SQL (for transparency) |
| Export options | CSV download, Copy to clipboard, **Generate Report** |
| Feedback buttons | Thumbs up/down for query quality |
| Save button | Add to saved queries with optional tags |

#### 4.6.3 Ad-Hoc Report Generation
Users can generate formatted reports from any query results in three formats: Microsoft Word, Microsoft Excel, and Adobe PDF.

**Report Formats**

| Format | File Type | Best For | Library |
|--------|-----------|----------|---------|
| Microsoft Word | .docx | Narrative reports, summaries, sharing with stakeholders | docx / officegen |
| Microsoft Excel | .xlsx | Data analysis, pivot tables, further manipulation | exceljs / xlsx |
| Adobe PDF | .pdf | Official documents, printing, archival | pdfkit / puppeteer |

**Report Generation Flow**
```
User clicks "Generate Report" → Select format → Configure options → Generate → Download
```

**Report Configuration Options**

| Option | Word | Excel | PDF | Details |
|--------|------|-------|-----|---------|
| Report title | ✓ | ✓ | ✓ | Custom title or auto-generated from query |
| Include AI summary | ✓ | ✓ | ✓ | Natural language explanation at top |
| Include query text | ✓ | ✓ | ✓ | Original question asked |
| Include timestamp | ✓ | ✓ | ✓ | When report was generated |
| Include branch name | ✓ | ✓ | ✓ | Branch context |
| Include charts | ✓ | ✓ | ✓ | If results contain visualizations |
| Page orientation | ✓ | - | ✓ | Portrait or Landscape |
| Include SQL | ✓ | ✓ | ✓ | Optional: show generated SQL |

**Word Document (.docx) Specifications**
| Element | Details |
|---------|---------|
| Template | YMCA branded header/footer with logo |
| Title style | Heading 1, centered |
| Summary section | Normal paragraph with AI-generated summary |
| Data presentation | Formatted table with alternating row colors |
| Fonts | Calibri (body), Calibri Bold (headers) |
| Margins | 1 inch all sides |
| Header | "YMCA [Branch Name] - Report" |
| Footer | Page number, generation timestamp |

**Excel Workbook (.xlsx) Specifications**
| Element | Details |
|---------|---------|
| Sheet 1: Summary | Report metadata, AI summary, query text |
| Sheet 2: Data | Full query results as formatted table |
| Sheet 3: Charts (if applicable) | Embedded charts from results |
| Table formatting | Auto-filter enabled, freeze header row |
| Column widths | Auto-fit to content |
| Header row | Bold, colored background (#003366), white text |
| Number formatting | Auto-detect dates, currency, percentages |
| Named ranges | Data table as named range for pivot table use |

**PDF Document Specifications**
| Element | Details |
|---------|---------|
| Page size | Letter (8.5" x 11") or A4 based on locale |
| Header | YMCA logo, branch name, report title |
| Footer | Page X of Y, generation timestamp, "Confidential" |
| Summary section | Styled box with AI summary |
| Data tables | Paginated with repeated headers |
| Charts | Embedded as high-resolution images |
| Fonts | Embedded for consistent rendering |
| Compression | Optimized for reasonable file size |

**Report Generation API Endpoint**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/report/generate` | POST | Generate report in specified format |

```typescript
// Request
POST /report/generate
{
  query_id: uuid,           // Reference to nl_queries record
  format: 'docx' | 'xlsx' | 'pdf',
  options: {
    title?: string,
    include_summary: boolean,
    include_query: boolean,
    include_sql: boolean,
    include_charts: boolean,
    orientation?: 'portrait' | 'landscape',
    include_timestamp: boolean
  }
}

// Response
{
  download_url: string,     // Temporary signed URL (expires in 1 hour)
  filename: string,         // e.g., "YMCA_Downtown_Attendance_Report_2024-12-16.docx"
  file_size: number,        // bytes
  expires_at: timestamp
}
```

**Report Storage**
| Requirement | Details |
|-------------|---------|
| Storage location | Supabase Storage bucket: `reports` |
| Retention | 24 hours (temporary), or saved to user's report library |
| Naming convention | `{branch}_{report_type}_{date}_{uuid}.{ext}` |
| Access control | Signed URLs, user-specific access |

**Report History Table**
```sql
CREATE TABLE generated_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    query_id UUID REFERENCES nl_queries(id) ON DELETE SET NULL,
    format TEXT NOT NULL CHECK (format IN ('docx', 'xlsx', 'pdf')),
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size INTEGER,
    options JSONB,
    is_saved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_generated_reports_user ON generated_reports(user_id);
CREATE INDEX idx_generated_reports_expires ON generated_reports(expires_at) 
    WHERE is_saved = FALSE;

-- RLS Policy
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_user_policy ON generated_reports
    FOR ALL USING (user_id = auth.uid());
```

---

### 4.7 Voice Output (ElevenLabs)

#### 4.7.1 Speech Synthesis
| Requirement | Details |
|-------------|---------|
| Provider | ElevenLabs API |
| Voice selection | User preference stored in profile; default voice for new users |
| Voice options | Minimum 4 voices (2 male, 2 female) |
| Audio format | MP3 streamed to browser |
| Playback controls | Play, Pause, Stop, Speed adjustment (0.75x - 1.5x) |

#### 4.7.2 Response Summarization for Voice
| Requirement | Details |
|-------------|---------|
| Single values | Read the value with context: "There were 47 classes last week" |
| Short lists | Read all items: "Available instructors are Sarah, Mike, and Jennifer" |
| Long results | Summarize: "I found 34 classes matching your criteria. The top 5 by attendance are... Full details are shown on screen." |
| Tables/Charts | Describe key insights: "Yoga classes show a 15% attendance increase over the past month, peaking on Wednesdays" |
| Errors | Explain issue: "I couldn't understand that question. Could you rephrase it?" |

#### 4.7.3 Auto-Play Settings
| Requirement | Details |
|-------------|---------|
| Default | Voice response auto-plays after results load |
| User preference | Toggle to disable auto-play in settings |
| Mute state | Respect system/browser mute; show visual indicator |

---

### 4.8 Query History & Persistence

#### 4.8.1 Data Model
```
Table: nl_queries
-----------------
id: uuid (PK)
user_id: uuid (FK → auth.users)
branch_id: uuid (FK → branches)
query_text: text (original natural language question)
generated_sql: text
result_summary: text (AI-generated summary)
result_data: jsonb (raw query results, max 1000 rows)
result_count: integer
execution_time_ms: integer
feedback_rating: smallint (null, 1=thumbs down, 2=thumbs up)
is_saved: boolean (default false)
tags: text[] (user-assigned tags)
created_at: timestamptz
```

#### 4.8.2 Query History View
| Requirement | Details |
|-------------|---------|
| Default view | Chronological list, most recent first |
| Pagination | 20 queries per page, infinite scroll or pagination |
| Display fields | Query text, timestamp, result count, saved status, tags |
| Quick actions | Re-run, Save/Unsave, Delete, View Details |
| Retention | All queries retained for 90 days; saved queries retained indefinitely |

#### 4.8.3 Saved Queries
| Requirement | Details |
|-------------|---------|
| Save action | One-click save from results panel or history |
| Naming | Optional custom name; defaults to truncated query text |
| Tags | Free-form tags, autocomplete from existing tags |
| Categories | Pre-defined: Attendance, Scheduling, Instructors, Rooms, Other |
| Re-run | Execute saved query to get fresh results |
| Edit | Modify query text and re-run |

#### 4.8.4 Search & Filter
| Requirement | Details |
|-------------|---------|
| Keyword search | Full-text search across query_text and result_summary |
| Multi-keyword | Support AND logic: "yoga monday" finds queries containing both |
| Tag filter | Filter by one or more tags |
| Category filter | Filter by category |
| Date range | Filter by created_at date range |
| Saved only | Toggle to show only saved queries |

---

### 4.9 User Settings

#### 4.9.1 Voice Preferences
| Setting | Options |
|---------|---------|
| Input method default | Text, Voice, or Last Used |
| Voice selection | Dropdown of available ElevenLabs voices |
| Auto-play responses | On/Off |
| Speech rate | Slider: 0.75x to 1.5x |

#### 4.9.2 Display Preferences
| Setting | Options |
|---------|---------|
| Results per page | 10, 20, 50, 100 |
| Show SQL by default | On/Off |
| Theme | Light/Dark/System |

---

## 5. Non-Functional Requirements

### 5.1 Performance
| Metric | Target |
|--------|--------|
| Voice transcription | < 3 seconds for 30-second audio |
| SQL generation | < 5 seconds |
| Query execution | < 10 seconds (95th percentile) |
| Voice synthesis | < 4 seconds to first audio byte |
| End-to-end (text query) | < 15 seconds |
| End-to-end (voice query) | < 20 seconds |

### 5.2 Reliability
| Metric | Target |
|--------|--------|
| Uptime | 99.5% |
| Graceful degradation | If ElevenLabs unavailable, text-only results |
| Error recovery | Automatic retry (1x) for transient API failures |

### 5.3 Security
| Requirement | Implementation |
|-------------|----------------|
| Authentication | Supabase Auth; must be logged in |
| Authorization | Branch managers only; enforce via RLS and role check |
| Data isolation | Queries automatically filtered to user's branch |
| API keys | Stored in environment variables; never exposed to client |
| Audit trail | All queries logged with user context |

### 5.4 Scalability
| Consideration | Approach |
|---------------|----------|
| Concurrent users | Edge Functions scale automatically |
| API rate limits | Queue requests if approaching limits; show "busy" message |
| Result storage | Truncate result_data to 1000 rows; full export available |

---

## 6. Technical Architecture

### 6.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js/React)                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Query Input │  │   Results   │  │   History   │  │  Settings   │ │
│  │  Component  │  │   Display   │  │    View     │  │    Panel    │ │
│  └──────┬──────┘  └──────▲──────┘  └──────▲──────┘  └─────────────┘ │
│         │                │                │                          │
│         ▼                │                │                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      State Management                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Supabase Edge Functions                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ transcribe-audio│  │  generate-query │  │  synthesize-speech  │  │
│  │   (Whisper)     │  │   (Claude API)  │  │   (ElevenLabs)      │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │              │
│           ▼                    ▼                      │              │
│  ┌──────────────────────────────────────┐            │              │
│  │         execute-query                 │            │              │
│  │    (SQL validation & execution)       │◄───────────┘              │
│  └──────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Supabase                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │   PostgreSQL    │  │   Auth/RLS      │  │     Storage         │  │
│  │   (all tables)  │  │                 │  │  (audio files)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 API Endpoints (Edge Functions)

| Endpoint | Method | Purpose | Input | Output |
|----------|--------|---------|-------|--------|
| `/transcribe` | POST | Convert audio to text | Audio blob | `{ text: string }` |
| `/query` | POST | Process NL query end-to-end | `{ query: string, branch_id: uuid }` | `{ sql, results, summary, audio_url }` |
| `/synthesize` | POST | Generate speech | `{ text: string, voice_id: string }` | Audio stream |
| `/report/generate` | POST | Generate Word/Excel/PDF report | `{ query_id, format, options }` | `{ download_url, filename }` |
| `/billing/usage` | GET | Get current usage stats | - | `{ tokens_used, allowance, unlimited_active }` |
| `/billing/checkout` | POST | Create Stripe checkout session | `{ product: 'unlimited_addon' }` | `{ checkout_url }` |
| `/billing/webhook` | POST | Handle Stripe webhooks | Stripe event | `{ received: true }` |
| `/history` | GET | Fetch query history | Query params for filters | `{ queries: Query[] }` |
| `/history/:id` | GET | Fetch single query details | Query ID | `{ query: Query }` |
| `/history/:id` | PATCH | Update saved status, tags | `{ is_saved, tags }` | `{ query: Query }` |
| `/history/:id` | DELETE | Delete query from history | Query ID | `{ success: boolean }` |

### 6.3 External API Integration

#### OpenAI Whisper API
```javascript
// Request
POST https://api.openai.com/v1/audio/transcriptions
Headers: Authorization: Bearer ${OPENAI_API_KEY}
Body: FormData { file: audio_blob, model: "whisper-1" }

// Response
{ "text": "transcribed text here" }
```

#### Anthropic Claude API
```javascript
// Request
POST https://api.anthropic.com/v1/messages
Headers: 
  x-api-key: ${ANTHROPIC_API_KEY}
  anthropic-version: 2023-06-01
Body: {
  model: "claude-opus-4-5-20251101",  // or configured model
  max_tokens: 4096,
  temperature: 0.1,
  system: "...", // See Section 8.1
  messages: [{ role: "user", content: query }]
}

// Response
{ content: [{ type: "text", text: "{ sql, explanation, format }" }] }
```

#### OpenAI API (Alternative Provider)
```javascript
// Request
POST https://api.openai.com/v1/chat/completions
Headers: 
  Authorization: Bearer ${OPENAI_API_KEY}
Body: {
  model: "gpt-4o",  // or configured model
  max_tokens: 4096,
  temperature: 0.1,
  messages: [
    { role: "system", content: "..." },  // See Section 8.1
    { role: "user", content: query }
  ],
  response_format: { type: "json_object" }
}

// Response
{ choices: [{ message: { content: "{ sql, explanation, format }" } }] }
```

#### ElevenLabs API
```javascript
// Request
POST https://api.elevenlabs.io/v1/text-to-speech/${voice_id}
Headers: xi-api-key: ${ELEVENLABS_API_KEY}
Body: {
  text: "Summary to speak",
  model_id: "eleven_monolingual_v1",
  voice_settings: { stability: 0.5, similarity_boost: 0.75 }
}

// Response: Audio stream (MP3)
```

---

## 7. Database Schema Additions

### 7.1 New Tables

```sql
-- Natural Language Queries History
CREATE TABLE nl_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    generated_sql TEXT,
    result_summary TEXT,
    result_data JSONB,
    result_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    feedback_rating SMALLINT CHECK (feedback_rating IN (1, 2)),
    is_saved BOOLEAN DEFAULT FALSE,
    saved_name TEXT,
    category TEXT CHECK (category IN ('attendance', 'scheduling', 'instructors', 'rooms', 'other')),
    tags TEXT[] DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for query history
CREATE INDEX idx_nl_queries_user_id ON nl_queries(user_id);
CREATE INDEX idx_nl_queries_branch_id ON nl_queries(branch_id);
CREATE INDEX idx_nl_queries_created_at ON nl_queries(created_at DESC);
CREATE INDEX idx_nl_queries_is_saved ON nl_queries(is_saved) WHERE is_saved = TRUE;
CREATE INDEX idx_nl_queries_tags ON nl_queries USING GIN(tags);
CREATE INDEX idx_nl_queries_fulltext ON nl_queries USING GIN(
    to_tsvector('english', query_text || ' ' || COALESCE(result_summary, ''))
);

-- User voice preferences
CREATE TABLE user_voice_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    elevenlabs_voice_id TEXT NOT NULL DEFAULT 'default_voice_id',
    auto_play_responses BOOLEAN DEFAULT TRUE,
    speech_rate DECIMAL(3,2) DEFAULT 1.00 CHECK (speech_rate BETWEEN 0.75 AND 1.50),
    default_input_method TEXT DEFAULT 'text' CHECK (default_input_method IN ('text', 'voice', 'last_used')),
    show_sql_by_default BOOLEAN DEFAULT FALSE,
    results_per_page INTEGER DEFAULT 20 CHECK (results_per_page IN (10, 20, 50, 100)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Available ElevenLabs voices (admin managed)
CREATE TABLE available_voices (
    id TEXT PRIMARY KEY, -- ElevenLabs voice_id
    name TEXT NOT NULL,
    gender TEXT CHECK (gender IN ('male', 'female', 'neutral')),
    description TEXT,
    preview_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0
);

-- Row Level Security
ALTER TABLE nl_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_voice_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see their own queries
CREATE POLICY nl_queries_user_policy ON nl_queries
    FOR ALL USING (user_id = auth.uid());

-- Users can only manage their own preferences
CREATE POLICY user_voice_preferences_policy ON user_voice_preferences
    FOR ALL USING (user_id = auth.uid());
```

### 7.2 RLS Considerations for AI Queries
The Edge Function executing AI-generated SQL will use the service role to bypass RLS, but the generated SQL will always include a `branch_id` filter matching the requesting user's assigned branch. This is enforced at the AI prompt level and validated before execution.

---

## 8. AI Prompt Engineering

### 8.1 System Prompt Template

```
You are a SQL query generator for the YMCA Branch Management System. Your role is to convert natural language questions into PostgreSQL SELECT queries.

## CRITICAL RULES
1. Generate ONLY SELECT statements - never INSERT, UPDATE, DELETE, or any DDL
2. ALWAYS include a WHERE clause filtering by branch_id = '{branch_id}'
3. Use appropriate JOINs based on the schema relationships
4. Include reasonable LIMIT clauses (default 100 unless user asks for more)
5. If the question is ambiguous, generate your best interpretation AND explain your assumptions

## DATABASE SCHEMA
{schema_definition}

## TABLE DESCRIPTIONS
{table_descriptions}

## EXAMPLE QUERIES
User: "How many yoga classes ran last month?"
SQL: SELECT COUNT(*) as yoga_class_count FROM classes c JOIN class_types ct ON c.class_type_id = ct.id WHERE ct.name ILIKE '%yoga%' AND c.branch_id = '{branch_id}' AND c.scheduled_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND c.scheduled_date < DATE_TRUNC('month', CURRENT_DATE);

User: "Show me rooms available on Monday mornings"
SQL: SELECT DISTINCT r.name, r.capacity FROM rooms r WHERE r.branch_id = '{branch_id}' AND r.id NOT IN (SELECT DISTINCT room_id FROM class_schedule WHERE day_of_week = 1 AND start_time < '12:00:00') ORDER BY r.name;

{additional_examples}

## RESPONSE FORMAT
Respond with a JSON object:
{
  "sql": "the generated SQL query",
  "explanation": "brief explanation of what the query does and any assumptions made",
  "result_format": "single_value|short_list|table|time_series|aggregation|yes_no",
  "voice_summary_template": "template for voice response, use {count} {result} placeholders"
}

If you cannot generate a valid query, respond with:
{
  "error": "explanation of why the query cannot be generated",
  "clarification_needed": "specific question to ask the user"
}
```

### 8.2 Schema Definition Format
```
Table: classes
Description: Individual scheduled class sessions
Columns:
  - id (uuid, PK): Unique identifier
  - branch_id (uuid, FK→branches): Branch where class occurs [ALWAYS FILTER ON THIS]
  - class_type_id (uuid, FK→class_types): Type of class (yoga, spin, etc.)
  - instructor_id (uuid, FK→instructors): Assigned instructor
  - room_id (uuid, FK→rooms): Room assignment
  - scheduled_date (date): Date of class
  - start_time (time): Start time
  - end_time (time): End time
  - capacity (int): Maximum participants
  - actual_attendance (int): Recorded attendance count
  
[Continue for all tables...]
```

---

## 9. User Interface Specifications

### 9.1 Query Interface Page (`/queries`)

#### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]  YMCA Branch Management    [Branch: Downtown]    [Profile ▼]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Ask a question about your branch data                       │   │
│  │  ┌─────────────────────────────────────────────────┐  [🎤]  │   │
│  │  │ e.g., "Show classes with low attendance"        │  [Ask] │   │
│  │  └─────────────────────────────────────────────────┘        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Results Area - appears after query]                        │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ Summary: Found 12 classes with attendance below 50%   │   │   │
│  │  │          [▶️ Play] [⏸️] [🔊 1.0x ▼]                    │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  [Data visualization/table here]                             │   │
│  │                                                              │   │
│  │  ────────────────────────────────────────────────────────   │   │
│  │  [💾 Save] [📋 Copy] [📥 Export CSV] [👍] [👎]             │   │
│  │                                                              │   │
│  │  ▶ Show SQL                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Query History Page (`/queries/history`)

#### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  Query History                                            [+ New]   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [🔍 Search queries...                    ] [Category ▼]     │   │
│  │ [Tags: attendance × scheduling ×        ] [Saved Only ☐]   │   │
│  │ [Date: Last 7 days ▼]                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ★ "Classes with 30 min availability gaps"     Dec 16, 2024  │   │
│  │   12 results · scheduling · rooms                  [▶ Run]  │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │   "Yoga attendance last month"                 Dec 15, 2024  │   │
│  │   47 results · attendance                          [▶ Run]  │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │   "Which instructors have availability Friday"  Dec 14, 2024 │   │
│  │   8 results · instructors                          [▶ Run]  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Load More]                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.3 Voice Recording Modal

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    🎤 Recording...                          │
│                                                             │
│                      ● 0:12 / 1:00                          │
│                                                             │
│              [Cancel]          [Done]                       │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Transcription:                                             │
│  "Show me all classes that have less than..."               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Error Handling

### 10.1 Error Categories and Responses

| Error Type | User Message | Technical Action |
|------------|--------------|------------------|
| Mic access denied | "Please allow microphone access in your browser settings" | Show browser-specific instructions |
| Transcription failed | "Sorry, I couldn't understand the audio. Please try again or type your question." | Log error, retry once |
| Query unclear | "I'm not sure what you're asking. Could you rephrase?" + AI's clarification question | Display AI's suggested rephrasing |
| Invalid SQL generated | "I couldn't create a valid query for that question. Try asking differently." | Log for review, don't expose SQL error |
| Query timeout | "That query is taking too long. Try asking for less data or a more specific question." | Kill query, suggest refinements |
| No results | "No data found matching your question." | Display empty state with suggestions |
| API rate limit | "We're experiencing high demand. Please try again in a moment." | Queue request, auto-retry |
| ElevenLabs error | [Silent failure, show text only] | Log error, graceful degradation |

### 10.2 Fallback Behavior
1. If Whisper fails → Prompt user to type instead
2. If Claude fails → Show generic "try again" with retry button
3. If ElevenLabs fails → Show results without audio, no error shown
4. If Supabase fails → Show error, retry button, escalation contact

---

## 11. Analytics & Monitoring

### 11.1 Metrics to Track

| Metric | Purpose |
|--------|---------|
| Queries per user per day | Usage patterns |
| Query success rate | AI quality |
| Average response time | Performance |
| Most common query patterns | Feature development |
| Feedback ratings distribution | AI improvement |
| Voice vs text input ratio | UX decisions |
| Re-run frequency | Query value indicator |

### 11.2 Logging Requirements
- All queries logged to `nl_queries` table
- API errors logged to Supabase Edge Function logs
- Performance metrics sent to monitoring dashboard
- Weekly summary email to admin with usage stats

---

## 12. Future Enhancements (Out of Scope for V1)

| Feature | Description | Priority |
|---------|-------------|----------|
| Query suggestions | AI suggests common queries based on context | High |
| Scheduled queries | Run saved queries on schedule, email results | Medium |
| Multi-branch queries | Admin role to query across branches | Medium |
| Report templates | Save custom report templates for reuse | Medium |
| Scheduled reports | Auto-generate and email reports on schedule | Medium |
| Query sharing | Share useful queries between branch managers | Low |
| Natural language updates | Allow controlled UPDATE operations | Low |
| Chart customization | User-adjustable visualizations | Low |

---

## 13. Acceptance Criteria

### 13.1 Core Functionality
- [ ] User can type a natural language question and receive relevant SQL results
- [ ] User can record voice input and see transcription before submission
- [ ] Results are displayed in appropriate format (table, chart, summary)
- [ ] Voice summary plays automatically (or on-demand per settings)
- [ ] All queries are saved to history automatically
- [ ] User can search and filter query history
- [ ] User can re-run any saved query
- [ ] User can add tags and categories to saved queries

### 13.2 Report Generation
- [ ] User can generate Word (.docx) reports from query results
- [ ] User can generate Excel (.xlsx) reports from query results
- [ ] User can generate PDF reports from query results
- [ ] Reports include YMCA branding (logo, colors, headers/footers)
- [ ] Reports include AI-generated summary
- [ ] Reports include formatted data tables
- [ ] Reports include charts/visualizations when applicable
- [ ] Generated reports are downloadable via secure signed URLs
- [ ] Report generation completes in under 30 seconds

### 13.3 Usage Tracking & Billing
- [ ] Token usage is tracked per query (input + output tokens)
- [ ] Usage counter displays in UI header
- [ ] 75% usage notification appears as banner and email
- [ ] Hard block at 100% usage with purchase prompt
- [ ] Stripe checkout opens for unlimited add-on purchase
- [ ] Payment success activates unlimited access for 30 days
- [ ] Email receipt sent after successful purchase
- [ ] Manager spending cap enforced ($100 default)
- [ ] Usage resets on rolling 30-day cycle
- [ ] Stripe Tax calculates applicable taxes automatically

### 13.4 Security
- [ ] Only SELECT queries are executed
- [ ] All queries are scoped to user's branch
- [ ] API keys are never exposed to client
- [ ] User can only see their own query history

### 13.5 Performance
- [ ] End-to-end text query completes in < 15 seconds
- [ ] End-to-end voice query completes in < 20 seconds
- [ ] Query history loads in < 2 seconds

### 13.6 Error Handling
- [ ] Graceful degradation if voice services unavailable
- [ ] Clear error messages for all failure modes
- [ ] Retry mechanism for transient failures

---

## 14. Implementation Notes for AI Agent (Opus 4.5)

### 14.1 Implementation Order
1. **Database first**: Create migration for new tables
2. **Edge Functions**: Build API endpoints starting with `/query`
3. **Frontend components**: Build query input, results display, history
4. **Voice integration**: Add Whisper input, then ElevenLabs output
5. **Polish**: Settings, error handling, loading states

### 14.2 Key Files to Create
```
/supabase/migrations/YYYYMMDD_nl_queries.sql
/supabase/migrations/YYYYMMDD_generated_reports.sql
/supabase/migrations/YYYYMMDD_billing_tables.sql
/supabase/functions/transcribe/index.ts
/supabase/functions/query/index.ts
/supabase/functions/synthesize/index.ts
/supabase/functions/report-generate/index.ts
/supabase/functions/billing-usage/index.ts
/supabase/functions/billing-checkout/index.ts
/supabase/functions/billing-webhook/index.ts
/src/components/QueryInput.tsx
/src/components/QueryResults.tsx
/src/components/VoiceRecorder.tsx
/src/components/QueryHistory.tsx
/src/components/VoicePlayer.tsx
/src/components/ReportModal.tsx               # Report configuration modal
/src/components/UsageIndicator.tsx            # Token usage badge/bar
/src/components/PurchaseModal.tsx             # Stripe payment popup
/src/pages/queries/index.tsx
/src/pages/queries/history.tsx
/src/hooks/useVoiceInput.ts
/src/hooks/useVoiceSynthesis.ts
/src/hooks/useReportGeneration.ts             # Report generation hook
/src/hooks/useUsage.ts                        # Usage tracking hook
/src/hooks/useStripeCheckout.ts               # Stripe checkout hook
/src/lib/ai-prompts.ts
/src/types/queries.ts
/src/types/billing.ts                         # Billing type definitions

# AI Provider Abstraction Layer
/src/lib/ai/types.ts              # AIProvider interface, response types
/src/lib/ai/provider-factory.ts   # createAIProvider() factory function
/src/lib/ai/anthropic-provider.ts # Anthropic/Claude implementation
/src/lib/ai/openai-provider.ts    # OpenAI/GPT implementation
/src/lib/ai/prompt-builder.ts     # Provider-agnostic prompt construction
/src/lib/ai/index.ts              # Public exports

# Report Generation
/src/lib/reports/types.ts              # Report configuration types
/src/lib/reports/word-generator.ts     # DOCX generation logic
/src/lib/reports/excel-generator.ts    # XLSX generation logic
/src/lib/reports/pdf-generator.ts      # PDF generation logic
/src/lib/reports/report-factory.ts     # Factory for report generators
/src/lib/reports/templates/            # YMCA branded templates

# Billing & Stripe
/src/lib/billing/usage-tracker.ts      # Token counting and tracking
/src/lib/billing/stripe-client.ts      # Stripe API wrapper
/src/lib/billing/types.ts              # Billing type definitions
```

### 14.3 Environment Variables Required
```env
# AI Provider Configuration
AI_PROVIDER=anthropic                      # anthropic | openai
AI_MODEL=claude-opus-4-5-20251101         # Model to use
AI_TEMPERATURE=0.1                         # Response creativity (0.0-1.0)
AI_MAX_TOKENS=4096                         # Max response length

# AI Provider API Keys
ANTHROPIC_API_KEY=                         # Required if AI_PROVIDER=anthropic
OPENAI_API_KEY=                            # Required for Whisper AND if AI_PROVIDER=openai

# Voice Services
ELEVENLABS_API_KEY=                        # Text-to-speech

# Stripe Configuration
STRIPE_SECRET_KEY=                         # Stripe secret key (sk_live_... or sk_test_...)
STRIPE_PUBLISHABLE_KEY=                    # Stripe publishable key (pk_live_... or pk_test_...)
STRIPE_WEBHOOK_SECRET=                     # Webhook signing secret (whsec_...)
STRIPE_UNLIMITED_PRICE_ID=                 # Price ID for unlimited add-on

# Billing Defaults (can override in admin)
DEFAULT_MONTHLY_TOKEN_ALLOWANCE=50000      # Tokens per branch per month
DEFAULT_SPENDING_CAP=100                   # Max manager can spend per month ($)
UNLIMITED_ADDON_PRICE=49                   # Price for unlimited add-on ($)

# Optional: Fallback Provider
AI_FALLBACK_ENABLED=false                  # Enable automatic fallback
AI_FALLBACK_PROVIDER=openai                # Fallback provider
AI_FALLBACK_MODEL=gpt-4o                   # Fallback model
```

### 14.4 Testing Considerations
- Mock external APIs in development
- Test with edge cases: empty results, huge results, ambiguous queries
- Test voice on multiple browsers
- Load test query execution
- Test branch isolation thoroughly

---

## 15. Appendix

### 15.1 Existing Database Schema

The following schema represents the current YMCA Attendance Tracking database. All AI-generated queries will reference these tables.

```sql
-- =====================================================
-- REFERENCE TABLES
-- =====================================================

-- YMCA branch locations
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,              -- Branch code (e.g., 'DT', 'NORTH')
    name TEXT NOT NULL,                      -- Display name (e.g., 'Downtown YMCA')
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: YMCA branch locations. Each branch operates independently with its own classes, instructors, and schedules.

-- Fitness class types
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id),  -- Branch this class belongs to
    name TEXT NOT NULL,                       -- Class name (e.g., 'BODYPUMP', 'Yoga Flow')
    description TEXT,
    category TEXT,                            -- Category (e.g., 'Strength', 'Mind/Body', 'Cardio')
    is_active BOOLEAN DEFAULT TRUE,           -- Soft delete flag
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, name)
);
-- Description: Fitness class types offered at each branch. Examples: BODYPUMP, Yoga, Spin, Zumba.

-- Room/studio locations within branches
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,               -- Location code (e.g., 'STUDIO-A', 'POOL')
    name TEXT NOT NULL,                       -- Display name (e.g., 'Group Exercise Studio A')
    is_active BOOLEAN DEFAULT TRUE,           -- Soft delete flag
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: Physical rooms/studios where classes are held. Shared across branches.

-- Fitness instructors
CREATE TABLE instructors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,  -- Primary branch
    auth_user_id UUID REFERENCES auth.users(id),                -- Supabase auth link
    raw_name TEXT,                            -- Original imported name
    first_name TEXT,
    last_name TEXT,
    nickname TEXT,                            -- Display name used in schedules
    pin SMALLINT UNIQUE,                      -- PIN for quick login
    is_active BOOLEAN DEFAULT TRUE,           -- Soft delete flag
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: Fitness instructors who teach classes. Can work at multiple branches.

-- Many-to-many: instructors ↔ branches
CREATE TABLE instructor_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,         -- Is this their primary branch?
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instructor_id, branch_id)
);
-- Description: Junction table linking instructors to the branches where they can teach.

-- =====================================================
-- SCHEDULING TABLES
-- =====================================================

-- Monthly schedule containers
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                       -- Schedule name (e.g., 'January 2025')
    month_start DATE UNIQUE NOT NULL,         -- First day of the month
    status TEXT DEFAULT 'draft',              -- draft | published | archived
    cloned_from_id UUID REFERENCES schedules(id),  -- Source schedule if cloned
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: Container for monthly class schedules. Schedules can be cloned from previous months.

-- Individual class occurrences with attendance
CREATE TABLE class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    day_of_week TEXT NOT NULL,                -- 'Monday', 'Tuesday', etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    session_date DATE,                        -- Specific date of this session
    effective_month DATE,                     -- Which month this session applies to
    original_time_text TEXT,                  -- Original imported time string
    headcount INTEGER,                        -- Attendance count
    headcount_submitted_at TIMESTAMPTZ,       -- When instructor submitted count
    headcount_updated_at TIMESTAMPTZ,         -- Last headcount update
    manager_approved BOOLEAN DEFAULT FALSE,   -- Manager approval status
    manager_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: Individual class session occurrences. Contains attendance (headcount) data and approval workflow.

-- Many-to-many: sessions ↔ instructors
CREATE TABLE session_instructors (
    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, instructor_id)
);
-- Description: Junction table linking class sessions to their assigned instructor(s). Supports multiple instructors per session.

-- =====================================================
-- SYSTEM TABLES
-- =====================================================

-- System notifications
CREATE TABLE Notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    header TEXT,
    title TEXT,
    notification TEXT,
    image BYTEA,
    image_bytes BYTEA,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: System-wide notifications displayed to users.

-- User tasks (Supabase template)
CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Description: User task list (standard Supabase template table).
```

### 15.2 Schema Relationships Summary

| From | To | Relationship | Join Pattern |
|------|-----|--------------|--------------|
| `class_sessions` | `branches` | Many-to-One | `class_sessions.branch_id = branches.id` |
| `class_sessions` | `schedules` | Many-to-One | `class_sessions.schedule_id = schedules.id` |
| `class_sessions` | `classes` | Many-to-One | `class_sessions.class_id = classes.id` |
| `class_sessions` | `locations` | Many-to-One | `class_sessions.location_id = locations.id` |
| `session_instructors` | `class_sessions` | Many-to-One | `session_instructors.session_id = class_sessions.id` |
| `session_instructors` | `instructors` | Many-to-One | `session_instructors.instructor_id = instructors.id` |
| `instructors` | `branches` | Many-to-One | `instructors.branch_id = branches.id` (primary branch) |
| `instructor_branches` | `instructors` | Many-to-One | `instructor_branches.instructor_id = instructors.id` |
| `instructor_branches` | `branches` | Many-to-One | `instructor_branches.branch_id = branches.id` |
| `classes` | `branches` | Many-to-One | `classes.branch_id = branches.id` |

### 15.3 Common Query Patterns for AI

The AI system prompt should include these example query patterns:

```sql
-- Pattern 1: Get all sessions for a branch with class and location details
SELECT 
    cs.id,
    cs.session_date,
    cs.day_of_week,
    cs.start_time,
    cs.end_time,
    cs.headcount,
    c.name as class_name,
    c.category as class_category,
    l.name as location_name
FROM class_sessions cs
JOIN classes c ON cs.class_id = c.id
JOIN locations l ON cs.location_id = l.id
WHERE cs.branch_id = '{branch_id}'
ORDER BY cs.session_date, cs.start_time;

-- Pattern 2: Get sessions with instructor information
SELECT 
    cs.id,
    cs.session_date,
    c.name as class_name,
    i.nickname as instructor_name
FROM class_sessions cs
JOIN classes c ON cs.class_id = c.id
JOIN session_instructors si ON cs.id = si.session_id
JOIN instructors i ON si.instructor_id = i.id
WHERE cs.branch_id = '{branch_id}';

-- Pattern 3: Find time gaps/availability in schedule
SELECT 
    cs.day_of_week,
    cs.end_time as slot_start,
    LEAD(cs.start_time) OVER (
        PARTITION BY cs.day_of_week, cs.location_id 
        ORDER BY cs.start_time
    ) as next_class_start,
    l.name as location_name
FROM class_sessions cs
JOIN locations l ON cs.location_id = l.id
JOIN schedules s ON cs.schedule_id = s.id
WHERE cs.branch_id = '{branch_id}'
  AND s.status = 'published'
ORDER BY cs.day_of_week, cs.start_time;

-- Pattern 4: Attendance summary by class type
SELECT 
    c.name as class_name,
    c.category,
    COUNT(*) as total_sessions,
    AVG(cs.headcount) as avg_attendance,
    SUM(cs.headcount) as total_attendance
FROM class_sessions cs
JOIN classes c ON cs.class_id = c.id
WHERE cs.branch_id = '{branch_id}'
  AND cs.headcount IS NOT NULL
GROUP BY c.id, c.name, c.category
ORDER BY avg_attendance DESC;

-- Pattern 5: Instructor workload
SELECT 
    i.nickname,
    i.first_name,
    i.last_name,
    COUNT(DISTINCT cs.id) as sessions_taught,
    COUNT(DISTINCT cs.day_of_week) as days_per_week
FROM instructors i
JOIN session_instructors si ON i.id = si.instructor_id
JOIN class_sessions cs ON si.session_id = cs.id
WHERE cs.branch_id = '{branch_id}'
GROUP BY i.id, i.nickname, i.first_name, i.last_name
ORDER BY sessions_taught DESC;

-- Pattern 6: Sessions pending manager approval
SELECT 
    cs.session_date,
    cs.day_of_week,
    cs.start_time,
    c.name as class_name,
    cs.headcount,
    cs.headcount_submitted_at,
    i.nickname as instructor
FROM class_sessions cs
JOIN classes c ON cs.class_id = c.id
JOIN session_instructors si ON cs.id = si.session_id
JOIN instructors i ON si.instructor_id = i.id
WHERE cs.branch_id = '{branch_id}'
  AND cs.headcount IS NOT NULL
  AND cs.manager_approved = FALSE
ORDER BY cs.headcount_submitted_at;

-- Pattern 7: Schedule status overview
SELECT 
    s.name as schedule_name,
    s.month_start,
    s.status,
    COUNT(cs.id) as total_sessions,
    COUNT(cs.headcount) as sessions_with_attendance
FROM schedules s
LEFT JOIN class_sessions cs ON s.id = cs.schedule_id AND cs.branch_id = '{branch_id}'
GROUP BY s.id, s.name, s.month_start, s.status
ORDER BY s.month_start DESC;
```

### 15.4 AI System Prompt Schema Section

Use this formatted schema in the AI system prompt:

```
## DATABASE SCHEMA

### Table: branches
Purpose: YMCA branch locations
Columns:
  - id (uuid, PK): Unique identifier
  - code (text, UNIQUE): Branch code (e.g., 'DT', 'NORTH')
  - name (text): Display name
  - address, city, state, zip, phone (text): Contact info
  - description (text): Branch description
  - created_at (timestamptz): Creation timestamp

### Table: classes
Purpose: Fitness class types (BODYPUMP, Yoga, Spin, etc.)
Columns:
  - id (uuid, PK): Unique identifier
  - branch_id (uuid, FK→branches): Branch this class belongs to
  - name (text): Class name
  - description (text): Class description
  - category (text): Category (Strength, Mind/Body, Cardio, etc.)
  - is_active (boolean): Soft delete flag
  - created_at (timestamptz): Creation timestamp

### Table: locations
Purpose: Rooms/studios where classes are held
Columns:
  - id (uuid, PK): Unique identifier
  - code (text, UNIQUE): Location code (e.g., 'STUDIO-A')
  - name (text): Display name
  - is_active (boolean): Soft delete flag
  - created_at (timestamptz): Creation timestamp

### Table: instructors
Purpose: Fitness instructors who teach classes
Columns:
  - id (uuid, PK): Unique identifier
  - branch_id (uuid, FK→branches): Primary branch assignment
  - auth_user_id (uuid, FK→auth.users): Supabase auth link
  - raw_name (text): Original imported name
  - first_name, last_name (text): Name fields
  - nickname (text): Display name in schedules [USE THIS FOR DISPLAY]
  - pin (smallint, UNIQUE): PIN for quick login
  - is_active (boolean): Soft delete flag
  - last_login_at (timestamptz): Last login time
  - created_at (timestamptz): Creation timestamp

### Table: instructor_branches
Purpose: Many-to-many link between instructors and branches
Columns:
  - id (uuid, PK): Unique identifier
  - instructor_id (uuid, FK→instructors): Instructor reference
  - branch_id (uuid, FK→branches): Branch reference
  - is_primary (boolean): Is this their primary branch?
  - created_at (timestamptz): Creation timestamp
Unique constraint: (instructor_id, branch_id)

### Table: schedules
Purpose: Monthly schedule containers
Columns:
  - id (uuid, PK): Unique identifier
  - name (text): Schedule name (e.g., 'January 2025')
  - month_start (date, UNIQUE): First day of the schedule month
  - status (text): draft | published | archived
  - cloned_from_id (uuid, FK→schedules): Source if cloned
  - published_at (timestamptz): When published
  - created_at (timestamptz): Creation timestamp

### Table: class_sessions
Purpose: Individual class occurrences with attendance tracking
Columns:
  - id (uuid, PK): Unique identifier
  - schedule_id (uuid, FK→schedules): Parent schedule
  - class_id (uuid, FK→classes): Class type
  - location_id (uuid, FK→locations): Room/studio
  - branch_id (uuid, FK→branches): Branch [ALWAYS FILTER ON THIS]
  - day_of_week (text): 'Monday', 'Tuesday', etc.
  - start_time (time): Session start time
  - end_time (time): Session end time
  - session_date (date): Specific date of session
  - effective_month (date): Which month this applies to
  - original_time_text (text): Original imported time
  - headcount (integer): Attendance count [NULL if not submitted]
  - headcount_submitted_at (timestamptz): When attendance was submitted
  - headcount_updated_at (timestamptz): Last attendance update
  - manager_approved (boolean): Approval status
  - manager_approved_at (timestamptz): When approved
  - created_at (timestamptz): Creation timestamp

### Table: session_instructors
Purpose: Many-to-many link between sessions and instructors
Columns:
  - session_id (uuid, PK/FK→class_sessions): Session reference
  - instructor_id (uuid, PK/FK→instructors): Instructor reference
Note: Composite primary key (session_id, instructor_id)

## CRITICAL QUERY RULES
1. ALWAYS filter class_sessions by branch_id = '{branch_id}'
2. Use instructor.nickname for display (not first_name/last_name)
3. Join through session_instructors to get instructor for a session
4. Check is_active = TRUE when querying classes, locations, instructors
5. Check schedule.status = 'published' for current active schedules
6. headcount IS NULL means attendance not yet submitted
```

### 15.2 Example Voice IDs (ElevenLabs)
To be populated after voice selection:
```json
{
  "voices": [
    { "id": "...", "name": "Rachel", "gender": "female" },
    { "id": "...", "name": "Drew", "gender": "male" },
    { "id": "...", "name": "Bella", "gender": "female" },
    { "id": "...", "name": "Antoni", "gender": "male" }
  ]
}
```

---

**Document Status**: Ready for schema insertion and implementation  
**Next Step**: Provide database schema, then begin implementation with database migrations
