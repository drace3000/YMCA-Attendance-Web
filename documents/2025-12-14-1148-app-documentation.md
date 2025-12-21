# YMCA Attendance App Documentation

**Project:** YMCA Attendance Tracker  
**Version:** 1.0.0  
**Platform:** React Native (Expo)  
**Last Updated:** Based on current codebase analysis

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Screens and Navigation](#screens-and-navigation)
4. [Features](#features)
5. [Authentication Flow](#authentication-flow)
6. [Data Management](#data-management)
7. [UI/UX Design](#uiux-design)
8. [Technical Stack](#technical-stack)
9. [Configuration](#configuration)
10. [Development Setup](#development-setup)

---

## Overview

The YMCA Attendance Tracker is a mobile application built with React Native and Expo that enables fitness instructors to manage class attendance and submit headcount data. The app supports branch-scoped authentication, allowing instructors to log in using either their schedule nickname or email address, and provides an intuitive interface for viewing and updating attendance records.

### Key Capabilities

- **Branch-scoped authentication** with nickname or email login
- **Onboarding flow** for new instructors
- **Attendance management** with period filtering (month/week/day)
- **Headcount submission** with timestamps
- **Multi-branch support** for instructors teaching at multiple locations
- **Immersive Android UI** with hidden system bars
- **Real-time clock display** on attendance screen

---

## Architecture

### Project Structure

```
YMCA-Attendance/
├── app/                    # Expo Router screens
│   ├── _layout.tsx        # Root layout and navigation
│   ├── index.tsx          # Root redirect to welcome
│   ├── welcome.tsx        # Welcome/splash screen
│   ├── attendance.tsx     # Main attendance management screen
│   ├── today.tsx          # Today's classes view
│   ├── oauth-callback.tsx # OAuth callback handler
│   └── auth/
│       ├── login.tsx      # Login screen
│       ├── onboarding.tsx # New instructor onboarding
│       └── reset.tsx       # Password reset
├── components/             # Reusable UI components
│   ├── themed-dialog.tsx  # Modal dialogs
│   ├── themed-text.tsx    # Themed text component
│   └── themed-view.tsx    # Themed view component
├── lib/                    # Business logic and utilities
│   ├── supabase.ts        # Supabase client configuration
│   ├── attendance.ts      # Attendance data functions
│   └── crypto-polyfill.ts # Crypto polyfill for React Native
├── hooks/                  # Custom React hooks
│   ├── use-immersive-nav.ts # Android immersive navigation
│   ├── use-color-scheme.ts  # Color scheme detection
│   └── use-theme-color.ts   # Theme color utilities
├── constants/              # App constants
│   └── theme.ts            # Theme colors and fonts
└── documents/              # Project documentation
```

### Navigation Architecture

The app uses **Expo Router** with file-based routing and a Stack navigator:

- **Root Stack:** All screens are registered in `app/_layout.tsx`
- **Deep Linking:** Supports OAuth callbacks via `ymcaattendance://` scheme
- **Session-based routing:** Welcome screen checks for existing session and routes accordingly

### Data Architecture

- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Client:** Supabase JS client with AsyncStorage persistence
- **RLS:** Row-level security ensures instructors only see their own data
- **State Management:** React hooks (useState, useEffect, useMemo)

---

## Screens and Navigation

### Screen Flow Diagram

```
Welcome (Splash)
    ├─→ Login (if no session)
    │   ├─→ Onboarding (if new user)
    │   │   └─→ Attendance (after auth)
    │   └─→ Attendance (if authenticated)
    └─→ Attendance (if session exists)
```

### Screen Descriptions

#### 1. Welcome Screen (`app/welcome.tsx`)

**Purpose:** Initial splash screen and entry point

**Features:**
- YMCA branding and logo
- Feature highlights (Empower Instructors, Capture Headcounts, Grow Together)
- "Start Session" button
- Help dialog with intro information
- AWD logo footer (clickable for notifications)

**Behavior:**
- Checks for existing Supabase session on mount
- Routes to `/attendance` if session exists
- Routes to `/auth/login` if no session
- Loads notifications from Supabase `Notifications` table

**UI Elements:**
- Animated glow effects on help button
- Pulsing footer logo animation
- Themed dialogs for help and notifications

---

#### 2. Login Screen (`app/auth/login.tsx`)

**Purpose:** Authenticate existing instructors

**Features:**
- **Identifier Input:** Accepts nickname or email
- **Branch Selection:** Required for nickname login
- **Password Input:** With show/hide toggle
- **Real-time Validation:** Checks nickname/email against branch
- **Auto-focus:** Password field focuses after successful verification

**Login Methods:**
1. **Email Login:**
   - Enter email → `email_in_branch()` verifies branch association
   - Enter password → `signInWithPassword()`

2. **Nickname Login:**
   - Select branch → Enter nickname → `nickname_exists()` verifies
   - `nickname_login_email()` resolves nickname to email
   - Enter password → `signInWithPassword()` with resolved email

**Validation:**
- Email format detection (presence of `@`)
- Branch-scoped nickname verification
- Password field enabled only after successful verification
- Error dialogs for invalid credentials

**Navigation:**
- Links to `/auth/onboarding` for new users
- Links to `/auth/reset` for password reset
- Routes to `/attendance` on successful login

---

#### 3. Onboarding Screen (`app/auth/onboarding.tsx`)

**Purpose:** Register new instructors

**Features:**
- **Branch Selection:** Choose branch from list
- **Nickname Entry:** With uniqueness check
- **Email Entry:** With confirmation field and duplicate check
- **Email Verification:** OTP code sent via Supabase
- **Profile Information:** First name, last name (optional)
- **Password Creation:** For email/password auth

**Flow:**
1. Select branch
2. Enter nickname → Check availability via `nickname_exists()`
3. Enter email → Check duplicates via `check_email_exists()`
4. Confirm email → Show confirmation dialog
5. Send OTP → Enter 6-digit code
6. Verify OTP → Create auth user
7. Claim instructor → Link via `claim_instructor()` RPC
8. Update last login → Via `update_last_login()` RPC
9. Navigate to `/attendance`

**Validation:**
- Nickname uniqueness per branch
- Email format and duplicate prevention
- Email confirmation matching
- OTP code verification

**Error Handling:**
- Duplicate email popup with retry
- Invalid OTP with resend option
- Network error handling

---

#### 4. Attendance Screen (`app/attendance.tsx`)

**Purpose:** Main screen for viewing and updating class attendance

**Features:**
- **Header:**
  - YMCA logo and branding
  - Branch name display
  - Schedule period (e.g., "September 2025 Schedule")
  - Instructor name display ("For: [Name]")
  - Live clock display (day, date, time)
  - Close button (logout/exit options)

- **Period Filtering:**
  - Month view (default)
  - Week view
  - Day view (with day picker)

- **Branch Selection:**
  - Multi-branch picker (if instructor teaches at multiple branches)
  - Primary branch default

- **Session Cards:**
  - Class name
  - Day, time, location
  - Headcount input field
  - Submission status
  - Update timestamp
  - Save button

**Data Loading:**
- Fetches instructor sessions via `fetchInstructorSessions()`
- Filters by period, branch, and day (if applicable)
- Sorted by day of week and start time
- Pull-to-refresh support

**Headcount Submission:**
- Updates `class_sessions.headcount`
- Sets `headcount_submitted_at` (first time)
- Sets `headcount_updated_at` (subsequent updates)
- Real-time validation and error handling

**UI Features:**
- Immersive Android navigation (hidden bars)
- Live clock updates every second
- Loading states and empty states
- Error dialogs
- Card-based layout with shadows

---

#### 5. OAuth Callback Screen (`app/oauth-callback.tsx`)

**Purpose:** Handle OAuth redirects (Google, etc.)

**Features:**
- Processes OAuth callback URLs
- Extracts auth tokens
- Claims instructor via `claim_instructor()`
- Updates last login
- Routes to attendance screen

---

#### 6. Password Reset Screen (`app/auth/reset.tsx`)

**Purpose:** Reset forgotten passwords

**Features:**
- Email input
- OTP code entry
- Password reset flow
- Navigation back to login

---

## Features

### Authentication Features

1. **Dual Login Methods**
   - Email + password
   - Nickname + branch + password

2. **Branch Scoping**
   - Instructors scoped to branches
   - Multi-branch support via `instructor_branches`
   - Primary branch designation

3. **Session Persistence**
   - AsyncStorage for session storage
   - Auto-refresh tokens
   - Session restoration on app restart

4. **Email Verification**
   - OTP-based email verification
   - 6-digit code delivery
   - Resend functionality with cooldown

### Attendance Features

1. **Period Views**
   - **Month:** All sessions for the month
   - **Week:** All sessions grouped by week
   - **Day:** Filtered by selected day

2. **Headcount Management**
   - Numeric input validation
   - First submission timestamp
   - Last update timestamp
   - Visual submission status

3. **Session Information**
   - Class name
   - Day of week
   - Start/end time
   - Location name
   - Effective month

4. **Multi-Branch Support**
   - Branch picker for instructors at multiple locations
   - Branch-scoped session filtering
   - Primary branch default

### UI/UX Features

1. **Immersive Android Experience**
   - Hidden navigation bar (swipe to reveal)
   - Hidden status bar
   - Full-screen attendance view

2. **Real-time Clock**
   - Live date/time display
   - Updates every second
   - Formatted: "Monday, December 10, 2025 @ hh:mm:ss"

3. **Themed Components**
   - YMCA brand colors (#01A490, #facc15)
   - Gradient backgrounds
   - Consistent styling

4. **Error Handling**
   - User-friendly error dialogs
   - Loading states
   - Empty states
   - Network error handling

---

## Authentication Flow

### New User Onboarding

```
1. Welcome Screen
   └─→ "Start Session" → Login Screen

2. Login Screen
   └─→ "Need a new account?" → Onboarding Screen

3. Onboarding Screen
   ├─→ Select Branch
   ├─→ Enter Nickname → Check uniqueness
   ├─→ Enter Email → Check duplicates
   ├─→ Confirm Email → Show confirmation dialog
   ├─→ Send OTP → Enter 6-digit code
   ├─→ Verify OTP → Create auth user
   ├─→ Claim Instructor → Link via RPC
   └─→ Navigate to Attendance
```

### Returning User Login

```
1. Welcome Screen
   ├─→ Check Session
   │   ├─→ Session exists → Attendance Screen
   │   └─→ No session → Login Screen

2. Login Screen
   ├─→ Email Login:
   │   ├─→ Enter email → Verify branch association
   │   ├─→ Enter password → Authenticate
   │   └─→ Navigate to Attendance
   │
   └─→ Nickname Login:
       ├─→ Select branch → Enter nickname → Verify exists
       ├─→ Resolve nickname to email
       ├─→ Enter password → Authenticate
       └─→ Navigate to Attendance
```

### Session Management

- **Storage:** AsyncStorage (`@react-native-async-storage/async-storage`)
- **Persistence:** Supabase client configured with `persistSession: true`
- **Refresh:** Auto-refresh tokens enabled
- **Restoration:** Session checked on app start

---

## Data Management

### Supabase Integration

**Client Configuration:**
- URL: `EXPO_PUBLIC_SUPABASE_URL`
- Anon Key: `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Storage: AsyncStorage for auth persistence
- Flow Type: PKCE

**Key Tables:**
- `branches` - Branch locations
- `instructors` - Instructor profiles
- `instructor_branches` - Multi-branch associations
- `class_sessions` - Class session instances
- `session_instructors` - Instructor-session links
- `schedules` - Schedule periods
- `classes` - Class types
- `locations` - Physical locations

**RPC Functions:**
- `check_email_exists()` - Email duplicate check
- `nickname_exists()` - Nickname availability
- `email_in_branch()` - Email-branch verification
- `nickname_login_email()` - Nickname to email resolution
- `claim_instructor()` - Link auth user to instructor
- `update_last_login()` - Update login timestamp

**Row Level Security:**
- Instructors can only read/update their own sessions
- Session access via `session_instructors` join
- Self-service instructor record access

### Data Fetching

**Attendance Sessions:**
```typescript
fetchInstructorSessions({
  period: 'month' | 'week' | 'day',
  instructorId: string,
  dayOfWeek?: string,
  scheduleId?: string,
  effectiveMonth?: string,
  branchId?: string | null
})
```

**Headcount Update:**
```typescript
updateHeadcount(
  sessionId: string,
  headcount: number,
  submittedAt?: string | null
)
```

### Caching

- **Last Claim:** Stored in AsyncStorage for quick routing
- **Session:** Persisted by Supabase client
- **Branches:** Loaded on login/onboarding screens

---

## UI/UX Design

### Brand Colors

- **Primary Green:** `#01A490` (YMCA teal)
- **Accent Yellow:** `#facc15` (Action buttons, highlights)
- **Dark Background:** `#0f172a` (Headers, cards)
- **Darkest Background:** `#052e16` (Gradients)
- **Text Light:** `#f8fafc` (Primary text)
- **Text Medium:** `#e2e8f0` (Secondary text)
- **Text Dark:** `#0f172a` (On light backgrounds)

### Typography

- **Headings:** 700-800 weight
- **Body:** 400-500 weight
- **Buttons:** 700-800 weight
- **Sizes:** 12px (small) to 28px (large titles)

### Components

**ThemedDialog:**
- Gradient background
- Customizable buttons
- Support for custom content
- Backdrop close option

**LinearGradient:**
- Used throughout for backgrounds
- YMCA brand colors
- Smooth transitions

**Immersive Navigation:**
- Android-specific
- Hidden system bars
- Swipe-to-reveal behavior

### Layout Patterns

- **SafeAreaView:** Used for all screens
- **Card-based:** Attendance sessions in cards
- **Centered:** Welcome and login screens
- **Full-width:** Attendance list view

---

## Technical Stack

### Core Technologies

- **React Native:** 0.81.5
- **Expo:** ~54.0.27
- **React:** 19.1.0
- **TypeScript:** ~5.9.2

### Key Libraries

**Navigation & Routing:**
- `expo-router`: ~6.0.17 (File-based routing)
- `@react-navigation/native`: ^7.1.8

**Backend & Auth:**
- `@supabase/supabase-js`: ^2.86.2
- `@react-native-async-storage/async-storage`: 2.2.0

**UI Components:**
- `expo-linear-gradient`: ~15.0.8
- `@react-native-picker/picker`: ^2.11.4
- `react-native-keyboard-aware-scroll-view`: ^0.9.5
- `react-native-safe-area-context`: ~5.6.0

**System Integration:**
- `expo-navigation-bar`: ~5.0.10
- `expo-status-bar`: ~3.0.9
- `expo-linking`: ~8.0.10

**Utilities:**
- `expo-constants`: ~18.0.11
- `expo-haptics`: ~15.0.8
- `react-native-reanimated`: ~4.1.1

### Development Tools

- **ESLint:** ^9.25.0
- **TypeScript:** ~5.9.2
- **EAS CLI:** ^16.28.0 (Build management)

---

## Configuration

### Environment Variables

**Required:**
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

**Optional:**
- `EXPO_PUBLIC_CONGRATS_ENDPOINT` - Congrats email endpoint (if configured)

### App Configuration (`app.json`)

**Basic:**
- Name: "YMCA-Attendance"
- Slug: "ymca-attendance"
- Version: "1.0.0"
- Orientation: Portrait

**Android:**
- Package: `com.drace3000.ymcaattendance`
- Edge-to-edge: `false` (for immersive navigation)
- Adaptive icon configured

**iOS:**
- Supports tablet: `true`

**Deep Linking:**
- Scheme: `ymcaattendance`
- OAuth redirect: `ymcaattendance://oauth-callback`

### EAS Build Configuration (`eas.json`)

**Profiles:**
- Preview: APK build for Android
- Production: APK build for Android

**Environment:**
- Supabase URL and Anon Key set per profile

---

## Development Setup

### Prerequisites

- Node.js (LTS recommended)
- npm or yarn
- Expo CLI
- EAS CLI (for builds)
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd YMCA-Attendance

# Install dependencies
npm install

# Set up environment variables
# Create .env file or set in eas.json
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Running the App

```bash
# Start Expo development server
npm start
# or
npx expo start

# Run on Android
npm run android
# or
npx expo start --android

# Run on iOS
npm run ios
# or
npx expo start --ios
```

### Building

```bash
# Preview build (Android)
eas build --platform android --profile preview

# Production build (Android)
eas build --platform android --profile production
```

### Code Structure Guidelines

1. **Screens:** Place in `app/` directory following Expo Router conventions
2. **Components:** Reusable components in `components/`
3. **Business Logic:** Data functions in `lib/`
4. **Hooks:** Custom hooks in `hooks/`
5. **Constants:** App-wide constants in `constants/`

### Testing Considerations

- **Expo Go:** Limited native module support (e.g., `expo-navigation-bar`)
- **Dev Client:** Required for full native feature testing
- **EAS Build:** Recommended for production-like testing

### Known Limitations

1. **Expo Go:**
   - Immersive navigation may not work fully
   - Some native modules unavailable

2. **Native Builds:**
   - Required for production deployment
   - EAS Build recommended

---

## Additional Notes

### Current Schedule

- **Default Schedule ID:** `a5af3ce8-9729-4073-b399-ee02e3268330`
- **Default Effective Month:** `2025-09-01` (September 2025)
- **Current Data:** 124 class sessions, 129 instructor-session links

### Future Enhancements

- Manager approval workflow (fields present but not enforced)
- Statistics/analytics dashboard (removed in current version)
- Additional period views
- Export functionality
- Offline support

### Security Considerations

- RLS policies enforce data isolation
- Auth tokens stored securely in AsyncStorage
- PKCE flow for OAuth
- Email verification required for new users
- Branch-scoped access control

---

## Support and Resources

- **Supabase Documentation:** https://supabase.com/docs
- **Expo Documentation:** https://docs.expo.dev
- **React Native Documentation:** https://reactnative.dev/docs
- **Project Documentation:** See `documents/` folder

---

*Last Updated: Based on current codebase analysis*

