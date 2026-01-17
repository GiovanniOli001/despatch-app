# Project Plan - January 18, 2026

## Overview
Bug fixes, UX improvements, and commit system rework for Dispatch App v1.9.0

---

## Priority 1: Critical Bugs ✅ COMPLETE

### 1.1 Roster Unpublish Deleting Inline Duties ✅ FIXED
**Issue:** When unpublishing a roster, inline duties added to shifts are removed. On republish, they're gone.

**Root Cause:** 
- `unpublishRoster` deleted ALL `roster_duty_lines` for the roster, including user-added inline duties
- `copyDutyLinesToRosterEntry` skipped creating template duties if ANY lines existed (including user-added)

**Solution:** 
- Only delete duty lines where `source_duty_line_id IS NOT NULL` (template-sourced)
- Check for template-sourced lines specifically before skipping copy

**Files Modified:**
- `roster.ts` - `unpublishRoster()` function
- `roster.ts` - `copyDutyLinesToRosterEntry()` function

**QA:** ✅ Passed

---

### 1.2 Pay Types Not Showing in Dispatch ✅ FIXED
**Issue:** Only hardcoded pay types show in duty dropdowns, not user-created ones.

**Root Cause:** Frontend used static constants instead of fetching from API.

**Solution:** 
- dispatch.js: Fetch from `/pay-types` API, store in `dispatchPayTypes` variable
- shifts.js: Fetch from `/pay-types` API, store in `shiftPayTypes` variable

**Files Modified:** `dispatch.js`, `shifts.js`

**QA:** ✅ Passed

---

### 1.3 Roster Delete Bypass ✅ FIXED
**Issue:** User could DELETE a roster assigned to calendar.

**Solution:** Added checks for published status and calendar scheduling before delete.

**Files Modified:** `roster.ts`

**QA:** ✅ Passed

---

### 1.4 Roster OPEN Button Bypass ✅ FIXED
**Issue:** OPEN button bypassed lockout for scheduled rosters.

**Solution:** Added check for `isScheduled` and `calendar_start_date` before opening.

**Files Modified:** `roster.js`

**QA:** ✅ Passed

---

### Additional Fixes ✅ COMPLETE
- **Clear Despatch** - Now preserves roster assignments (`ops-calendar.ts`)
- **HRM Page Loading** - Fixed variable conflict, added typeof checks (`dispatch.js`, `app.js`)

---

## Priority 2: Commit System Rework ✅ COMPLETE

### 2.1 Remove Uncommit Feature ✅ FIXED
**Issue:** Uncommit creates confusion and data integrity issues.

**Solution:**
- Removed `uncommitDay()` function from dispatch.js
- Renamed backend function to `uncommitDay_DISABLED()`, not exported
- DELETE endpoint now returns 403 error with guidance message
- Always hide uncommit button in UI

**Files Modified:**
- `dispatch.js` - Removed function, always hide uncommit button
- `dispatch.ts` - Removed import, endpoint returns 403
- `dispatch-commit.ts` - Function disabled but retained for potential admin use

**QA:** ✅ Passed

---

### 2.2 Additive-Only Commits ✅ FIXED
**Issue:** Commits should only ADD pay records, never remove them.

**Solution:**
- Re-commits allowed: If commit exists, update timestamp instead of error
- Cancelled duties excluded: LEFT JOIN on `dispatch_duty_cancellations`, filter `ddc.id IS NULL`
- Existing check for `source_duty_line_id` already prevents duplicate pay records

**Files Modified:**
- `dispatch-commit.ts` - `commitDay()` allows updates, `generatePayRecords()` excludes cancelled

**QA:** ✅ Passed

---

### 2.3 Show Last Committed Timestamp ✅ FIXED
**Issue:** Need clearer indication of when day was last committed.

**Solution:**
- Changed from "Committed at {time}" to "Last committed: DD/MM/YYYY HH:MM"
- Australian date format (en-AU)
- Commit button always visible (can re-commit to capture new duties)

**Files Modified:**
- `dispatch.js` - `updateCommitUI()` function

**QA:** ✅ Passed

---

## Priority 3: HRM Enhancements ✅ COMPLETE

### 3.1 Larger Employee Edit Modal ✅ FIXED
**Issue:** Modal too small for custom fields and pay records.

**Solution:**
- Increased modal width from 700px to 900px
- Added min-height: 500px
- Increased pay records table height from 350px to 450px

**Files Modified:**
- `main.css` - `.crud-modal-tabbed` and `.pay-records-table-wrapper` styles

**QA:** ✅ Passed

---

### 3.2 Pay Record Notes Column Rework ✅ FIXED
**Issue:** Notes display is "dodgy" - full text in column.

**Solution:**
- Column shows 📝 icon when notes exist, "—" when empty
- Click icon opens modal with timestamped note history
- Removed M badge from notes column (manual edits still have yellow row highlight)
- Added multi-note support: notes stored as JSON array with timestamps
- Edit modal shows "Notes History" + "Add Note" input
- New notes appended with automatic timestamp

**Files Modified:**
- `hrm.js` - `renderPayRecordsTable()`, `editPayRecord()`, `savePayRecordEdit()`, new `parseNotesArray()`, `showPayRecordNotes()`, `formatNotesTimestamp()`, `showNotesModal()`, `closeNotesModal()`
- `main.css` - `.notes-icon-btn`, `.notes-history-container`, `.notes-history-entry`, `.notes-modal-content`, `.notes-entry` styles
- `index.html` - Pay record edit modal updated with Notes History section

**QA:** ✅ Passed

---

## Priority 4: UI/UX Improvements ✅ COMPLETE

### 4.1 Custom Fields Button ✅ FIXED
**Issue:** Cog wheel icon not intuitive.
**Solution:** Replaced ⚙️ icon with "Custom Fields" text button.
**Files Modified:** `index.html`, `hrm.js`

**QA:** ✅ Passed

---

### 4.2 Operations Calendar Filters ✅ FIXED
**Issue:** Heading says "Rosters this month" but shows all rosters.
**Solution:**
- Added filter buttons: `All` | `This Month` | `Published` | `Draft`
- Rosters sorted by start date ascending
- Filter state maintained during session

**Files Modified:** `roster.js`, `main.css`

**QA:** ✅ Passed

---

### 4.3 Rosters Screen Force Refresh ✅ FIXED
**Issue:** Sometimes opens to already-opened roster instead of list.
**Solution:** `loadRosters()` now always resets to list view and clears current roster state.

**Files Modified:** `roster.js`

**QA:** ✅ Passed

---

### 4.4 Roster Processing Loading Indicator ✅ FIXED
**Issue:** "Processing..." toast disappears before completion, user might navigate away.
**Solution:** 
- Full-screen overlay with spinner
- Shows during publish/unpublish/toggle operations
- Blocks interaction until complete

**Files Modified:** `roster.js`, `main.css`

**QA:** ✅ Passed

---

### 4.5 Consistent Confirmation Modals ✅ FIXED
**Issue:** Some confirmations use browser `confirm()`, others use styled modals.
**Solution:** 
- Created reusable `showConfirmModal(title, message, onConfirm, options)` function
- Replaced all 11 browser confirm() calls across roster.js, hrm.js, shifts.js
- Dangerous actions show red "Delete" button
- Consistent styling throughout app

**Files Modified:** `app.js`, `roster.js`, `hrm.js`, `shifts.js`, `main.css`

**QA:** ✅ Passed

---

## Priority 5: Code Cleanup

### 5.1 Remove Fake Data
**Issue:** No longer needed - we're live.
**Solution:** Remove fake data generator, remove data source selector.
**Files:** `dispatch.js`

---

### 5.2 Remove Primary View Options
**Issue:** No longer supporting Vehicle → Driver view.
**Solution:** Remove the selector entirely.
**Files:** `dispatch.js`, `index.html`

---

## Progress Summary

| Priority | Status | Items |
|----------|--------|-------|
| P1 | ✅ Complete | 6/6 items |
| P2 | ✅ Complete | 3/3 items |
| P3 | ✅ Complete | 2/2 items |
| P4 | ✅ Complete | 5/5 items |
| P5 | 🔄 Next | 0/2 items |

---

## Suggested Order for Next Session

1. **5.1 Remove Fake Data** - Code cleanup
2. **5.2 Remove Primary View Options** - Code cleanup

---

## Version Target
**v1.9.0** - Commit system rework, bug fixes, UX improvements ✅ FEATURE COMPLETE
