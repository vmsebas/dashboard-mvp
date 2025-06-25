# Deploy Modal Update - Summary of Changes

## Date: June 25, 2025

### Objective
Update the `showDeployConfigModal` function to load and display the current port configuration from the apps-registry.json file, allowing users to keep the existing port or change it.

### Changes Made:

#### 1. Updated `showDeployConfigModal` function in `/Users/mini-server/server-dashboard-mvp/public/js/projects.js`
- Made the function `async` to support fetching data from the API
- Added code to fetch current port and domain from the apps registry
- Added an info alert showing the current configuration (port and domain)
- Pre-filled the port input field with the current port value
- Pre-filled the subdomain field with the current subdomain (if exists)
- Added a checkbox "Mantener puerto actual (XXXX)" that appears only when a current port exists
- When the checkbox is checked (default), the port field becomes read-only
- When unchecked, users can modify the port value

#### 2. Created new API endpoint `/api/apps/registry` in `/Users/mini-server/server-dashboard-mvp/server.js`
- Returns the complete apps-registry.json file content
- Handles errors gracefully, returning empty apps object if file doesn't exist

#### 3. Updated `deployProject` function to properly await the async modal function

### Features Added:
1. **Current Port Detection**: The modal now reads the current port from apps-registry.json
2. **Visual Indicator**: Shows an info alert with "Configuración actual detectada" displaying the current port and domain
3. **Pre-filled Values**: Port and subdomain fields are pre-filled with current values
4. **Keep Current Port Option**: A checkbox allows users to explicitly keep the current port
5. **Smart Behavior**: When "keep current port" is checked, the port field becomes read-only

### Testing:
Created a test file at `/Users/mini-server/server-dashboard-mvp/test-deploy-modal.html` to verify the functionality works correctly for:
- Projects with existing port configurations (MiGestPro, server-dashboard-mvp, iva-api)
- Projects without port configurations (new-project)
- Projects with uncommitted changes

### How It Works:
1. When the deploy button is clicked, the modal fetches data from `/api/apps/registry`
2. If the project exists in the registry, it extracts the port and domain
3. The modal displays this information and pre-fills the form fields
4. Users can choose to keep the current port (default) or change it
5. The deploy process continues with the selected configuration

### Files Modified:
- `/Users/mini-server/server-dashboard-mvp/public/js/projects.js`
- `/Users/mini-server/server-dashboard-mvp/server.js`

### Files Created:
- `/Users/mini-server/server-dashboard-mvp/test-deploy-modal.html` (for testing)
- `/Users/mini-server/server-dashboard-mvp/DEPLOY_MODAL_UPDATE.md` (this file)

### Notes:
- The PM2 process `server-dashboard-mvp` was restarted to apply the server.js changes
- The solution is backward compatible - projects without registry entries work as before
- The checkbox only appears when a current port is detected