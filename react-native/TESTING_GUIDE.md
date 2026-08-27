# React Native Calendar App - Testing Guide

## Test Strategy

This guide covers manual and automated testing for the Phase 3-2 React Native implementation.

## Unit Tests

Run all unit tests:

```bash
npm test
```

Run specific test file:

```bash
npm test auth.service.test.ts
```

Watch mode:

```bash
npm test -- --watch
```

### Test Coverage Goals

- Services: 100% coverage
- Store: 90% coverage
- Components: 70% coverage (visual testing is manual)
- Overall: 80%+ coverage

## Manual Testing Checklist

### 1. Authentication Flow

#### Google Login
- [ ] LoginScreen displays Google button
- [ ] Clicking Google button opens authentication
- [ ] After successful auth, navigates to HomeScreen
- [ ] Access token is stored
- [ ] Refresh token is stored
- [ ] User ID is stored
- [ ] User email is stored

#### Naver Login
- [ ] LoginScreen displays Naver button
- [ ] Clicking Naver button opens authentication
- [ ] After successful auth, navigates to HomeScreen
- [ ] Credentials stored correctly

#### Token Persistence
- [ ] Close and reopen app
- [ ] App remains logged in
- [ ] Credentials restored from storage
- [ ] Kill app process and restart
- [ ] Credentials still available

#### Logout
- [ ] Logout button visible on HomeScreen
- [ ] Clicking logout shows confirmation
- [ ] Confirming logout clears storage
- [ ] Returns to LoginScreen
- [ ] Tokens are removed

### 2. Home Screen Tests

#### Note List Display
- [ ] Notes load when opening HomeScreen
- [ ] Recent notes appear in correct order
- [ ] Note title displays
- [ ] Note preview displays (first 60 chars)
- [ ] Note date displays
- [ ] Synced status shows correctly
- [ ] Pending status shows for unsync notes
- [ ] Empty state shows when no notes

#### Refresh Functionality
- [ ] Pull down on note list
- [ ] Refresh spinner appears
- [ ] List updates with latest notes
- [ ] Pull refresh completes
- [ ] Error handling on refresh failure

#### Note Interactions
- [ ] Tap note opens CalendarScreen
- [ ] Delete button visible on each note
- [ ] Tap delete shows confirmation
- [ ] Confirm delete removes note
- [ ] Cancel delete keeps note
- [ ] Delete triggers network call (if online)

#### FAB (Floating Action Button)
- [ ] FAB visible in bottom-right
- [ ] Tap FAB navigates to CalendarScreen
- [ ] FAB for creating new note

### 3. Calendar Screen Tests

#### Create New Note
- [ ] Screen opens with empty fields
- [ ] Title input works
- [ ] Content input works (multiline)
- [ ] Date picker shows current date
- [ ] Can select different date
- [ ] Save button enabled when required fields filled
- [ ] Save button disabled when fields empty
- [ ] Clicking Save creates note
- [ ] Returns to HomeScreen after save
- [ ] New note appears in list

#### Edit Existing Note
- [ ] Tap note from list opens edit screen
- [ ] Current title loads
- [ ] Current content loads
- [ ] Current date loads
- [ ] Can modify title
- [ ] Can modify content
- [ ] Can change date
- [ ] Save button works
- [ ] Changes persist
- [ ] Delete button appears
- [ ] Back button without save discards changes

#### Date Picker
- [ ] Date button shows current date
- [ ] Tap opens date picker
- [ ] Can select different month
- [ ] Can select different day
- [ ] Can navigate to future/past years
- [ ] Selected date updates button

#### Offline Behavior
- [ ] Note creates successfully offline
- [ ] "Pending sync" status appears
- [ ] Can still edit note offline
- [ ] Can still delete note offline
- [ ] Note saved to local storage
- [ ] Syncs when online

#### Validation
- [ ] Cannot save without title
- [ ] Cannot save without content
- [ ] Shows error for empty fields
- [ ] Clears errors when fields filled

### 4. Offline Functionality

#### Local Storage
- [ ] Create note offline
- [ ] Note appears in list as "pending"
- [ ] Close and reopen app offline
- [ ] Note still appears
- [ ] Can edit offline note
- [ ] Can delete offline note
- [ ] Multiple offline notes preserved

#### Sync on Connection
- [ ] Create note offline
- [ ] Turn on connection
- [ ] Sync automatically starts
- [ ] Note "pending" status changes to synced
- [ ] No duplicate notes created

#### Conflict Resolution
- [ ] Modify note locally offline
- [ ] Modify same note on server
- [ ] Connect to internet
- [ ] Sync completes without error
- [ ] Data consistent (choose resolution strategy)
- [ ] No data loss

### 5. Network Monitoring

#### Network State Changes
- [ ] App detects when going online
- [ ] App detects when going offline
- [ ] Console shows network state changes
- [ ] Sync starts when online
- [ ] Sync stops when offline

#### Auto-Sync
- [ ] With internet, notes sync every 30 seconds
- [ ] Auto-sync works for pending notes
- [ ] Synced notes show as "synced"
- [ ] Force refresh works

#### Network Error Handling
- [ ] Network timeout handled gracefully
- [ ] HTTP 401 triggers token refresh
- [ ] HTTP 404 shows error
- [ ] HTTP 500 retries
- [ ] Network errors don't crash app

### 6. Performance Tests

#### Large Note List
- [ ] Load app with 100+ notes
- [ ] List scrolls smoothly
- [ ] No lag on note selection
- [ ] Search still responsive

#### Large Note Content
- [ ] Create note with 10,000+ characters
- [ ] Saves successfully
- [ ] Loads quickly
- [ ] Edit performs well

#### Many Pending Notes
- [ ] Create 50+ notes offline
- [ ] All sync correctly when online
- [ ] No missed notes
- [ ] No duplicates

### 7. Edge Cases

#### Long Titles/Content
- [ ] Very long title (200+ chars) handled
- [ ] Very long content wraps correctly
- [ ] Text not truncated unexpectedly

#### Special Characters
- [ ] Emoji in title and content
- [ ] Unicode characters
- [ ] Special symbols (&, <, >, etc.)
- [ ] Newlines preserved in content

#### Rapid Actions
- [ ] Create note, immediately close app
- [ ] Delete note, immediately close app
- [ ] Create then edit quickly
- [ ] No data corruption

#### Storage Limits
- [ ] Many notes (1000+) handled
- [ ] Storage doesn't fill up unexpectedly
- [ ] Old notes don't get lost
- [ ] Query performance maintained

## Integration Tests

### Complete User Flow

#### Scenario 1: Create and Sync
1. [ ] Launch app
2. [ ] Login with Google
3. [ ] Create note online
4. [ ] Verify note synced
5. [ ] Close and reopen app
6. [ ] Verify note still appears

#### Scenario 2: Offline Creation
1. [ ] Logout
2. [ ] Disable network
3. [ ] Re-login (should fail or use cache)
4. [ ] Create multiple notes offline
5. [ ] Verify all appear as pending
6. [ ] Enable network
7. [ ] Verify all sync
8. [ ] Verify no duplicates

#### Scenario 3: Multi-Device Sync
1. [ ] Create note on Device A
2. [ ] Note syncs to server
3. [ ] Open app on Device B
4. [ ] Verify note appears
5. [ ] Edit on Device B
6. [ ] Verify update syncs
7. [ ] Check Device A sees update

## Performance Benchmarks

### Target Metrics

- **App Launch Time**: < 3 seconds
- **Note List Load**: < 1 second for 100 notes
- **Save Note**: < 500ms locally, < 2 seconds with sync
- **Search**: < 500ms for 1000 notes
- **Offline Capacity**: 10,000+ notes
- **Memory Usage**: < 100MB for normal use

### Measure Performance

```typescript
// In development, add performance marks
import { PerformanceObserver } from 'react-native-performance';

const start = performance.now();
// ... operation ...
const end = performance.now();
console.log(`Operation took ${end - start}ms`);
```

## Automated Testing

### Jest Configuration

Run tests with coverage:

```bash
npm test -- --coverage --watchAll=false
```

### Test Organization

```
src/__tests__/
├── auth.service.test.ts          # 15+ tests
├── local-storage.service.test.ts # 12+ tests
├── sync.service.test.ts          # 10+ tests
├── notes.store.test.ts           # 10+ tests
└── integration.test.ts           # 5+ end-to-end
```

### Mocking Strategy

- **API Calls**: Mock axios client
- **AsyncStorage**: Mock storage
- **NetInfo**: Mock network state
- **Navigation**: Mock React Navigation
- **Zustand Store**: Mock store state

## Debugging Tips

### Enable Verbose Logging

```typescript
// In App.tsx or services
console.log = (...args) => {
  console.warn('[DEBUG]', ...args);
};
```

### React Native Debugger

1. Launch React Native Debugger
2. Enable "Debug" in dev menu
3. Inspect network, console, storage

### AsyncStorage Inspector

```typescript
async function inspectStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const data = await AsyncStorage.multiGet(keys);
  console.log('All stored data:', data);
}
```

### Network Request Inspection

```typescript
// In AuthService
apiClient.interceptors.request.use(config => {
  console.log('Request:', config.method, config.url);
  return config;
});

apiClient.interceptors.response.use(
  response => {
    console.log('Response:', response.status);
    return response;
  },
  error => {
    console.error('Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);
```

## Known Issues & Workarounds

### Issue 1: Android Toast Notifications
- Use Alert instead of Toast
- AlertAsync library for async alerts

### Issue 2: iOS Keyboard Issues
- Use KeyboardAvoidingView
- Adjust padding dynamically

### Issue 3: FlatList Performance
- Use removeClippedSubviews
- Implement ViewToken optimization

## Sign-Off Checklist

- [ ] All unit tests pass (>80% coverage)
- [ ] All manual tests pass
- [ ] No console errors or warnings
- [ ] Performance benchmarks met
- [ ] Integration tests pass
- [ ] Edge cases handled
- [ ] Documentation complete
- [ ] Ready for alpha testing
