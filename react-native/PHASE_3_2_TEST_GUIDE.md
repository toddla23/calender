# Phase 3-2: React Native Real-Time Sync Testing Guide

## Quick Start

### Prerequisites
- Android emulator(s) or iOS simulator(s) running
- React Native development environment set up
- Backend Spring Boot server running on http://localhost:8080
- Metro bundler running

### Setup
```bash
# Install dependencies
cd react-native
npm install

# Start Metro bundler
npm start

# In another terminal, run on Android
npm run android

# Or iOS
npm run ios
```

## Test Scenarios

### Scenario 1: Authentication Flow

**Objective**: Verify OAuth login and session establishment

**Steps**:
1. Launch app on device/emulator
2. Tap "Sign in with Google"
3. Complete OAuth flow
4. Return to app
5. Should see Home screen with empty notes list

**Expected Results**:
- [ ] OAuth dialog appears
- [ ] Login completes successfully
- [ ] Navigation to Home screen
- [ ] No errors in console
- [ ] Auth tokens stored

**Verification**:
```bash
# Check AsyncStorage
adb logcat | grep "Auth"
# OR iOS logs in Xcode console
```

---

### Scenario 2: WebSocket Connection

**Objective**: Verify real-time WebSocket connection after login

**Steps**:
1. Login successfully
2. Check console logs
3. Look for "WebSocket connected" message

**Expected Results**:
- [ ] "WebSocket connected for real-time sync" in console
- [ ] No connection errors
- [ ] Subscription to `/user/{userId}/topic/sync`
- [ ] Connection persists

**Verification**:
```bash
# Monitor WebSocket logs
npm start -- --verbose
# Watch for STOMP/WebSocket debug messages
```

**Test Code** (add to HomeScreen.tsx temporarily):
```typescript
useEffect(() => {
  console.log('HomeScreen mounted - WebSocket should be connected');
  // Check if WebSocket is connected
  return () => console.log('HomeScreen unmounted');
}, []);
```

---

### Scenario 3: Create Note Locally

**Objective**: Test offline note creation

**Steps**:
1. Be on Home screen after login
2. Tap "+" button to create note
3. Enter title "Test Note 1"
4. Enter content "This is a test"
5. Tap "Save"

**Expected Results**:
- [ ] Note appears in list immediately
- [ ] Note marked as "pending" (visual indicator)
- [ ] No errors shown

**Verification**:
```typescript
// Check store state
useNotesStore.getState().notes
// Should contain your note with synced: false
```

---

### Scenario 4: Single-Client Sync

**Objective**: Verify note syncs to backend

**Steps**:
1. Create note locally (Scenario 3)
2. Wait 2-3 seconds
3. Note should disappear "pending" indicator
4. Check backend database

**Expected Results**:
- [ ] Note transitions from "pending" to "synced"
- [ ] Note appears in backend database
- [ ] No sync errors in console

**Verification**:
```bash
# Check backend logs
docker-compose logs backend | grep "sync"

# Query database
mysql -u calendar_user -p calendar_db
SELECT * FROM notes WHERE title="Test Note 1";
```

---

### Scenario 5: Multi-Client Real-Time Sync (Create)

**Objective**: Verify real-time note creation across clients

**Prerequisites**:
- Two devices/emulators with same account logged in
- Both connected to same backend
- Both on Home screen

**Steps on Client A**:
1. Create note: Title "Shared Note", Content "Created on Client A"
2. Tap Save
3. Note syncs to backend (wait for "synced" state)

**Steps on Client B** (watch screen):
1. New note should appear in list within 200ms
2. Title: "Shared Note"
3. Content: "Created on Client A"

**Expected Results**:
- [ ] Client A: Note created and synced
- [ ] Client B: Note appears automatically in real-time
- [ ] Both clients show identical note
- [ ] No duplicate notes
- [ ] Latency <500ms

**Verification**:
```bash
# Monitor console on both clients
npm start -- --verbose

# Check Network tab in React Native Debugger
# Should see STOMP subscription and messages

# Verify database
SELECT * FROM notes WHERE title="Shared Note";
```

---

### Scenario 6: Multi-Client Real-Time Sync (Update)

**Objective**: Verify real-time note updates across clients

**Prerequisites**:
- Have a shared note from Scenario 5
- Two clients logged in

**Steps on Client A**:
1. Open note "Shared Note"
2. Edit content to "Updated from Client A"
3. Tap "Save"
4. Wait for sync

**Steps on Client B** (watch screen):
1. Note content should update automatically
2. Should show "Updated from Client A"

**Expected Results**:
- [ ] Client A: Update synced
- [ ] Client B: Update received within 200ms
- [ ] No conflicts
- [ ] Both clients show same content

**Verification**:
```bash
# Check backend logs for update
docker-compose logs backend | grep "note_updated"

# Verify database timestamp
SELECT * FROM notes WHERE title="Shared Note";
```

---

### Scenario 7: Multi-Client Real-Time Sync (Delete)

**Objective**: Verify real-time note deletion across clients

**Prerequisites**:
- Have a shared note
- Two clients logged in

**Steps on Client A**:
1. Select note "Shared Note"
2. Tap "Delete"
3. Confirm deletion

**Steps on Client B** (watch screen):
1. Note should disappear from list within 200ms
2. No longer visible anywhere

**Expected Results**:
- [ ] Client A: Note deleted
- [ ] Client B: Note removed from list in real-time
- [ ] No orphaned notes
- [ ] Database reflects deletion

**Verification**:
```bash
# Verify deletion
SELECT * FROM notes WHERE title="Shared Note";
# Should return empty result

# Check backend logs
docker-compose logs backend | grep "note_deleted"
```

---

### Scenario 8: Offline Mode - Create

**Objective**: Verify note creation while offline

**Steps**:
1. Disable network on device (Airplane mode or turn off WiFi)
2. Create new note: "Offline Note"
3. Tap Save
4. Verify note appears with "pending" indicator

**Expected Results**:
- [ ] Note created locally
- [ ] Marked as "pending"
- [ ] Stored in AsyncStorage
- [ ] No sync errors (handled gracefully)

**Verification**:
```bash
# Check store state
useNotesStore.getState().notes
# Should include offline note with synced: false

# Check pending queue
AsyncStorage.getItem('calendar_pending_sync')
# Should include note ID
```

---

### Scenario 9: Offline Mode - Multiple Operations

**Objective**: Verify multiple operations queue while offline

**Prerequisites**:
- Network disabled

**Steps**:
1. Create note 1: "Offline 1"
2. Create note 2: "Offline 2"
3. Edit note 1: Change content
4. Create note 3: "Offline 3"
5. Verify all appear locally with "pending"

**Expected Results**:
- [ ] All 3 notes visible in list
- [ ] All marked "pending"
- [ ] No errors
- [ ] All stored locally

**Verification**:
```typescript
// Check pending queue
const pending = await AsyncStorage.getItem('calendar_pending_sync');
const noteIds = JSON.parse(pending);
console.log('Pending notes:', noteIds); // Should have 3 IDs
```

---

### Scenario 10: Offline to Online Transition

**Objective**: Verify sync on network reconnection

**Prerequisites**:
- Created 3 notes while offline (Scenario 9)
- Network still disabled

**Steps**:
1. Re-enable network (disable Airplane mode)
2. Wait 2-3 seconds
3. Watch console for sync messages
4. Verify "pending" indicators disappear

**Expected Results**:
- [ ] Network status changes to online
- [ ] Sync automatically triggered
- [ ] All 3 notes synced to backend
- [ ] "pending" indicators disappear
- [ ] No errors in console

**Verification**:
```bash
# Monitor console for sync logs
npm start -- --verbose
# Should see "Syncing X pending notes..."
# Should see "Successfully synced X notes"

# Verify in database
SELECT * FROM notes WHERE title LIKE "Offline%";
# Should find all 3 notes
```

---

### Scenario 11: Manual Sync Trigger

**Objective**: Verify manual sync button (if implemented)

**Steps**:
1. Create some pending notes (offline or recent)
2. Tap "Sync Now" button (if present)
3. Watch for sync messages

**Expected Results**:
- [ ] Sync triggered manually
- [ ] Pending notes synced
- [ ] UI updates after sync

**Verification**:
```bash
# Check for manual sync in code
grep -r "forceSyncWithServer" react-native/src
```

---

### Scenario 12: Network Interruption Recovery

**Objective**: Verify graceful recovery from network interruption

**Steps**:
1. Be online with active WebSocket
2. Disable network suddenly
3. Wait 5 seconds
4. Re-enable network
5. Verify connection restored

**Expected Results**:
- [ ] App detects offline
- [ ] "No connection" state shows (if UI updated)
- [ ] App automatically reconnects when online
- [ ] WebSocket re-established
- [ ] No data loss

**Verification**:
```bash
# Monitor connection attempts
npm start -- --verbose
# Should see disconnection and reconnection logs
```

---

### Scenario 13: Conflict Resolution

**Objective**: Verify last-write-wins conflict resolution

**Prerequisites**:
- Two clients with same account

**Steps on Client A**:
1. Open note from Scenario 5
2. Edit to "Update from A"
3. Wait 3 seconds (don't save yet)

**Steps on Client B**:
1. Open same note
2. Edit to "Update from B"
3. Tap Save (Sync to backend)

**Steps on Client A**:
1. Tap Save (Sync to backend)
2. Wait for conflict resolution

**Expected Results**:
- [ ] Client B update wins (last-write-wins)
- [ ] Client A shows "Update from B" after sync
- [ ] No data corruption
- [ ] Consistent across all clients

**Verification**:
```bash
# Check final state in database
SELECT * FROM notes WHERE id="<note-id>";
# Content should be "Update from B"
```

---

### Scenario 14: Calendar View

**Objective**: Verify calendar displays notes

**Steps**:
1. Navigate to Calendar screen
2. View current month
3. Dates with notes should be highlighted
4. Tap date with notes to see them

**Expected Results**:
- [ ] Calendar renders correctly
- [ ] Notes dates are marked
- [ ] Can view notes by date
- [ ] Clicking dates shows notes

**Verification**:
```typescript
// Verify notes are grouped by date
const calendar = useNotesStore.getState();
console.log(calendar.getNotesByDate(new Date()));
```

---

### Scenario 15: Search Functionality

**Objective**: Verify search works

**Steps**:
1. On Home screen
2. Tap search box
3. Type search term
4. Verify matching notes appear

**Expected Results**:
- [ ] Search filters notes
- [ ] Only matching notes shown
- [ ] Clear search restores list

**Verification**:
```typescript
// Verify search method
const store = useNotesStore.getState();
console.log(store.searchNotes('test'));
```

---

### Scenario 16: Token Refresh

**Objective**: Verify token refresh on 401

**Steps**:
1. Be logged in
2. Wait for token to expire (or simulate expiration)
3. Make a request
4. App should automatically refresh token
5. Request should succeed with new token

**Expected Results**:
- [ ] Automatic token refresh
- [ ] Request succeeds after refresh
- [ ] No re-login required
- [ ] User doesn't notice

**Verification**:
```bash
# Monitor interceptor
grep -r "401\|refresh" react-native/src/services
```

---

### Scenario 17: Logout

**Objective**: Verify clean logout

**Steps**:
1. Be on Home screen (logged in)
2. Tap "Logout" button
3. Verify navigation to Login screen
4. Verify data cleared

**Expected Results**:
- [ ] WebSocket disconnected
- [ ] Navigation to Login screen
- [ ] Auth tokens cleared
- [ ] Notes not visible
- [ ] Can login again

**Verification**:
```bash
# Check AsyncStorage is cleared
AsyncStorage.getItem('calendar_auth')
# Should be null

# Check WebSocket disconnected
npm start -- --verbose
# Should see "WebSocket disconnected"
```

---

### Scenario 18: Large Payload Handling

**Objective**: Verify app handles large notes

**Steps**:
1. Create note with very long content (10KB+)
2. Save and sync
3. Receive on another client
4. Verify no truncation

**Expected Results**:
- [ ] Full content transmitted
- [ ] No truncation
- [ ] No performance issues
- [ ] Latency still acceptable

---

### Scenario 19: Rapid Fire Operations

**Objective**: Verify app handles rapid operations

**Steps**:
1. Quickly create 5 notes
2. Quickly update 3 notes
3. Quickly delete 2 notes
4. Verify all sync correctly

**Expected Results**:
- [ ] All operations queued
- [ ] No data loss
- [ ] No duplicate operations
- [ ] Correct final state

---

### Scenario 20: Memory Leak Check

**Objective**: Verify no memory leaks

**Steps**:
1. Monitor memory in device settings
2. Perform 50 create/update/delete cycles
3. Monitor memory again
4. Perform garbage collection (if available)

**Expected Results**:
- [ ] Memory usage stable
- [ ] No unbounded growth
- [ ] App remains responsive

**Verification**:
```bash
# Use React Native Debugger
# Monitor memory in Performance tab
# Look for consistent memory usage
```

---

## Performance Baselines

### Expected Metrics

| Metric | Expected | Max |
|--------|----------|-----|
| Note creation latency | 50-100ms | 200ms |
| WebSocket message latency | 50-200ms | 500ms |
| Sync completion (10 notes) | 1-2s | 5s |
| Memory usage | <50MB | 100MB |
| Offline queue handling | <1s per 10 notes | 5s |
| Search performance | <100ms | 500ms |

---

## Debugging Tips

### Console Logging
```typescript
// Add debug mode
const DEBUG = true;
const log = DEBUG ? console.log : () => {};

// Use in services
log('[WebSocket] Connected:', payload);
log('[Sync] Syncing', notes.length, 'notes');
```

### React Native Debugger
```bash
# Open debugger
npm start
# Press 'd' in Metro

# Or connect manually
open "rndebugger://set-debugger-loc?host=localhost&port=8081"
```

### AsyncStorage Inspection
```typescript
// Temporary debug function
const inspectStorage = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const items = await AsyncStorage.multiGet(keys);
  console.table(items);
};

// Call from component
useEffect(() => {
  inspectStorage();
}, []);
```

### Network Inspection
```bash
# Use Charles Proxy or similar
# Monitor WebSocket frames
# Check HTTP request/response

# Or use adb for Android
adb shell
# Inside shell
tcpdump -w /data/local/tmp/capture.pcap
# Transfer to computer
adb pull /data/local/tmp/capture.pcap
# Open in Wireshark
```

---

## Troubleshooting Common Issues

### Issue: WebSocket fails to connect

**Symptoms**:
- "WebSocket not connected" messages
- No real-time updates received
- Fallback to polling

**Solutions**:
1. Check backend is running
2. Verify backend URL in code
3. Check auth token validity
4. Verify CORS headers
5. Check firewall settings

**Debug**:
```typescript
const wsService = new WebSocketService('http://localhost:8080');
try {
  await wsService.connect(token, userId);
  console.log('Connected');
} catch (error) {
  console.error('Connection failed:', error);
}
```

---

### Issue: Offline notes don't sync

**Symptoms**:
- Pending notes don't sync when online
- "pending" indicator stays forever
- Data lost

**Solutions**:
1. Check network status is detected
2. Verify backend availability
3. Check note IDs not duplicated
4. Verify storage permissions

**Debug**:
```typescript
const pending = await LocalStorageService.getPendingSyncNotes();
console.log('Pending:', pending);

// Try manual sync
await SyncService.syncPendingNotes();
```

---

### Issue: Duplicate notes appear

**Symptoms**:
- Same note appears twice in list
- Different IDs or timestamps

**Solutions**:
1. Check ID generation
2. Verify conflict resolution
3. Restart app
4. Clear cache

**Debug**:
```typescript
const notes = useNotesStore.getState().notes;
const ids = notes.map(n => n.id);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log('Duplicates:', duplicates);
```

---

### Issue: Memory keeps growing

**Symptoms**:
- App gets slower over time
- Eventually crashes
- High memory usage

**Solutions**:
1. Check for memory leaks in subscriptions
2. Verify unsubscribe functions called
3. Implement list virtualization
4. Clear old notes periodically

**Debug**:
```typescript
// Use React Profiler
import { unstable_trace as trace } from 'react';

trace('note-update', performance.now(), () => {
  store.updateNote(id, updates);
});
```

---

## Automated Tests

### Run Unit Tests
```bash
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Expected Test Results
```
PASS  src/__tests__/auth.service.test.ts
PASS  src/__tests__/websocket.service.test.ts
PASS  src/__tests__/sync.service.test.ts
PASS  src/__tests__/local-storage.service.test.ts

Test Suites: 4 passed, 4 total
Tests: 30 passed, 30 total
Snapshots: 0 total
Time: 5.234 s
```

---

## Test Reporting Template

### Test Execution Report

**Date**: [Date]
**Tester**: [Name]
**Environment**: 
- Device: [Device/Emulator]
- OS: [Android/iOS Version]
- App Version: 0.1.0

**Test Results**:

| Scenario | Status | Notes |
|----------|--------|-------|
| 1. Auth Flow | ✅ PASS | Smooth OAuth flow |
| 2. WebSocket | ✅ PASS | Connected within 1s |
| 3. Local Create | ✅ PASS | Instant feedback |
| ... | ... | ... |

**Issues Found**: [List any bugs]

**Performance**:
- WebSocket latency: ~150ms
- Sync latency: ~1.5s for 10 notes
- Memory: 45MB steady state

**Blockers**: [Any issues preventing use]

---

## Success Criteria

All tests must pass:
- [ ] Authentication works
- [ ] WebSocket connects
- [ ] Real-time sync works (all 3 operations)
- [ ] Offline mode works
- [ ] Reconnection syncs data
- [ ] Multi-client consistency
- [ ] No memory leaks
- [ ] Performance acceptable

---

**Last Updated**: 2026-08-27
**Version**: 3-2.0
**Next Review**: After Phase 3-2 testing completion
