# Browser Window Position & Size Persistence

## Objective

Implement persistent browser window positioning and sizing for a production web application. When users resize or relocate the browser window, save these settings and automatically restore them on subsequent loads.

## Tech Stack

- Node.js
- TypeScript
- Tailwind CSS

## Browser Security Constraints

Browsers restrict `window.moveTo()` and `window.resizeTo()` for security reasons. These methods **only work on windows opened via `window.open()`** from your script—not on the main browser window or user-opened tabs.

---

## Recommended Implementation: Popup Window Approach

This approach provides full positioning control by launching the app in a controlled popup window.

### File Structure

```
src/
├── launcher/
│   ├── launcher.html      # Simple launcher page
│   └── launcher.ts        # Launcher logic
├── lib/
│   └── windowPersistence.ts  # Core persistence logic
└── app.ts                 # Main app integration
```

### 1. Window Persistence Module

Create `src/lib/windowPersistence.ts`:

```typescript
export interface WindowSettings {
  width: number;
  height: number;
  left: number;
  top: number;
  savedAt: number;
}

const STORAGE_KEY = 'app-window-settings';

const DEFAULT_SETTINGS: WindowSettings = {
  width: 1200,
  height: 800,
  left: 100,
  top: 100,
  savedAt: 0
};

/**
 * Retrieve saved window settings from localStorage
 */
export function getWindowSettings(): WindowSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WindowSettings;
      // Validate settings are within screen bounds
      return validateSettings(parsed);
    }
  } catch (error) {
    console.warn('Failed to parse window settings:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save current window settings to localStorage
 */
export function saveWindowSettings(): void {
  const settings: WindowSettings = {
    width: window.outerWidth,
    height: window.outerHeight,
    left: window.screenX,
    top: window.screenY,
    savedAt: Date.now()
  };
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save window settings:', error);
  }
}

/**
 * Validate settings are within current screen bounds
 */
function validateSettings(settings: WindowSettings): WindowSettings {
  const maxWidth = window.screen.availWidth;
  const maxHeight = window.screen.availHeight;
  
  return {
    width: Math.min(settings.width, maxWidth),
    height: Math.min(settings.height, maxHeight),
    left: Math.max(0, Math.min(settings.left, maxWidth - settings.width)),
    top: Math.max(0, Math.min(settings.top, maxHeight - settings.height)),
    savedAt: settings.savedAt
  };
}

/**
 * Generate window.open() features string from settings
 */
export function getWindowFeatures(settings: WindowSettings): string {
  return [
    `width=${settings.width}`,
    `height=${settings.height}`,
    `left=${settings.left}`,
    `top=${settings.top}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes'
  ].join(',');
}
```

### 2. Launcher Page

Create `src/launcher/launcher.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Launch Application</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
  <div class="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
    <h1 class="text-2xl font-bold text-gray-800 mb-4">Application Launcher</h1>
    <p class="text-gray-600 mb-6">
      Click below to launch the application. Your window position and size will be remembered.
    </p>
    <button 
      id="launchBtn"
      class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
    >
      Launch Application
    </button>
    <p class="text-sm text-gray-500 mt-4" id="settingsInfo"></p>
  </div>
  <script type="module" src="./launcher.ts"></script>
</body>
</html>
```

Create `src/launcher/launcher.ts`:

```typescript
import { getWindowSettings, getWindowFeatures, type WindowSettings } from '../lib/windowPersistence';

const APP_URL = '/app'; // Adjust to your app's entry point
const WINDOW_NAME = 'myProductionApp';

let appWindow: Window | null = null;

function launchApp(): void {
  const settings = getWindowSettings();
  const features = getWindowFeatures(settings);
  
  // Check if window is already open
  if (appWindow && !appWindow.closed) {
    appWindow.focus();
    return;
  }
  
  appWindow = window.open(APP_URL, WINDOW_NAME, features);
  
  if (!appWindow) {
    alert('Popup blocked! Please allow popups for this site.');
  }
}

function displaySettingsInfo(): void {
  const settings = getWindowSettings();
  const infoEl = document.getElementById('settingsInfo');
  
  if (infoEl && settings.savedAt > 0) {
    const savedDate = new Date(settings.savedAt).toLocaleString();
    infoEl.textContent = `Last saved: ${settings.width}×${settings.height} at (${settings.left}, ${settings.top}) - ${savedDate}`;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const launchBtn = document.getElementById('launchBtn');
  launchBtn?.addEventListener('click', launchApp);
  displaySettingsInfo();
});
```

### 3. Main Application Integration

Add to your main application entry point (`src/app.ts` or equivalent):

```typescript
import { saveWindowSettings } from './lib/windowPersistence';

class WindowPersistenceManager {
  private saveTimeout: number | null = null;
  private lastX: number = window.screenX;
  private lastY: number = window.screenY;
  private moveCheckInterval: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Save on resize (debounced)
    window.addEventListener('resize', () => this.debouncedSave());
    
    // Save before page unload
    window.addEventListener('beforeunload', () => saveWindowSettings());
    
    // Poll for window move (no native event exists)
    this.startMoveDetection();
    
    // Initial save to capture starting position
    saveWindowSettings();
  }

  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      saveWindowSettings();
      this.saveTimeout = null;
    }, 500);
  }

  private startMoveDetection(): void {
    this.moveCheckInterval = window.setInterval(() => {
      if (window.screenX !== this.lastX || window.screenY !== this.lastY) {
        this.lastX = window.screenX;
        this.lastY = window.screenY;
        this.debouncedSave();
      }
    }, 1000);
  }

  public destroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    if (this.moveCheckInterval) {
      clearInterval(this.moveCheckInterval);
    }
  }
}

// Initialize when DOM is ready
let windowManager: WindowPersistenceManager;

document.addEventListener('DOMContentLoaded', () => {
  windowManager = new WindowPersistenceManager();
});

export { windowManager };
```

### 4. React Hook Alternative (if using React)

Create `src/hooks/useWindowPersistence.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { saveWindowSettings } from '../lib/windowPersistence';

export function useWindowPersistence(): void {
  const saveTimeoutRef = useRef<number | null>(null);
  const lastPositionRef = useRef({ x: window.screenX, y: window.screenY });

  useEffect(() => {
    const debouncedSave = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveWindowSettings();
        saveTimeoutRef.current = null;
      }, 500);
    };

    const handleResize = () => debouncedSave();
    const handleBeforeUnload = () => saveWindowSettings();

    // Move detection polling
    const moveCheckInterval = setInterval(() => {
      const { x, y } = lastPositionRef.current;
      if (window.screenX !== x || window.screenY !== y) {
        lastPositionRef.current = { x: window.screenX, y: window.screenY };
        debouncedSave();
      }
    }, 1000);

    window.addEventListener('resize', handleResize);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Initial save
    saveWindowSettings();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(moveCheckInterval);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
}
```

Usage in your App component:

```tsx
import { useWindowPersistence } from './hooks/useWindowPersistence';

function App() {
  useWindowPersistence();
  
  return (
    // Your app content
  );
}
```

---

## Alternative: Electron Wrapper (Full Desktop Control)

If you need guaranteed window control without browser limitations, wrap your app in Electron.

### Install Dependencies

```bash
npm install electron electron-store
npm install -D @types/electron
```

### Electron Main Process

Create `electron/main.ts`:

```typescript
import { app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import path from 'path';

interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

const store = new Store<{ windowBounds: WindowBounds }>();

function createWindow(): void {
  const defaultBounds: WindowBounds = { width: 1200, height: 800 };
  const bounds = store.get('windowBounds', defaultBounds);

  const win = new BrowserWindow({
    ...bounds,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load your Node.js app
  win.loadURL('http://localhost:3000');

  // Save bounds on close
  win.on('close', () => {
    store.set('windowBounds', win.getBounds());
  });

  // Save bounds on resize/move (debounced)
  let saveTimeout: NodeJS.Timeout | null = null;
  const saveBounds = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!win.isDestroyed()) {
        store.set('windowBounds', win.getBounds());
      }
    }, 500);
  };

  win.on('resize', saveBounds);
  win.on('move', saveBounds);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

---

## Testing Checklist

- [ ] Window settings persist after browser/app close
- [ ] Settings restore correctly on relaunch
- [ ] Multi-monitor scenarios handled (window stays on screen)
- [ ] Settings validated against current screen dimensions
- [ ] Graceful fallback if localStorage unavailable
- [ ] Debouncing prevents excessive saves during resize/drag

---

## Notes

- The popup window approach requires user interaction to avoid popup blockers
- Consider adding a "Reset Window Position" option for users
- For production, you may want to store settings server-side for cross-device persistence
- Test thoroughly on different screen resolutions and multi-monitor setups
