# React Native Calendar App - Setup Guide

## Project Overview

This is a Phase 3-2 React Native implementation of the calendar app with offline support, OAuth authentication, and real-time sync capabilities.

## Prerequisites

- Node.js 16+ and npm
- Xcode (iOS) or Android Studio (Android)
- CocoaPods (for iOS)

## Installation

### 1. Install Dependencies

```bash
cd /home/ec2-user/projects/calender/react-native
npm install
```

### 2. Install Native Dependencies (iOS)

```bash
cd ios
pod install
cd ..
```

### 3. Environment Configuration

Create `.env` file in the project root:

```
REACT_APP_API_URL=http://localhost:8080/api
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
REACT_APP_NAVER_CLIENT_ID=your_naver_client_id
```

## Project Structure

```
src/
├── screens/
│   ├── LoginScreen.tsx       # OAuth login screen
│   ├── HomeScreen.tsx        # Recent notes list
│   └── CalendarScreen.tsx    # Note creation/editing
├── components/
│   ├── NoteListItem.tsx      # Individual note UI
│   ├── CalendarView.tsx      # Calendar grid view
│   └── ...
├── services/
│   ├── auth.service.ts       # OAuth & token management
│   ├── notes.service.ts      # Note API calls
│   ├── local-storage.service.ts  # Offline storage
│   └── sync.service.ts       # Sync management & network monitoring
├── store/
│   ├── auth.ts              # Authentication state (Zustand)
│   └── notes.ts             # Notes state (Zustand)
├── types/
│   └── Note.ts              # TypeScript interfaces
├── __tests__/
│   ├── auth.service.test.ts
│   ├── local-storage.service.test.ts
│   └── sync.service.test.ts
├── App.tsx                  # Root component
└── index.js                 # Entry point
```

## Running the App

### Android

```bash
# Start dev server
npm start

# In another terminal, run Android
npm run android
```

### iOS

```bash
# Start dev server
npm start

# In another terminal, run iOS
npm run ios
```

## Features Implementation

### 1. Authentication (LoginScreen)

- Google OAuth login
- Naver OAuth login
- Token storage in AsyncStorage
- Token refresh mechanism

**Test Plan:**
- [ ] Google login redirects to Google auth
- [ ] Naver login redirects to Naver auth
- [ ] Tokens are stored after successful login
- [ ] Token refresh works when token expires
- [ ] Logout clears stored tokens

### 2. Home Screen

- Display recent 10 notes
- Pull to refresh
- Delete note from list
- FAB to create new note
- Logout button

**Test Plan:**
- [ ] Notes list loads on screen open
- [ ] Pull to refresh reloads notes
- [ ] Delete note removes from list
- [ ] FAB navigates to calendar/note creation
- [ ] Logout works and returns to login screen

### 3. Calendar Screen

- Create/edit notes with date picker
- Note title and content
- Save locally and sync to server
- Shows offline status
- Displays synced status

**Test Plan:**
- [ ] Can create note with title and content
- [ ] Date picker works correctly
- [ ] Note saved successfully
- [ ] Offline notes show "pending" status
- [ ] Delete note works
- [ ] Navigate back saves or discards changes

### 4. Offline Support

- Local storage with AsyncStorage
- Pending sync queue
- Sync when connection restored
- Merge conflicts resolution

**Test Plan:**
- [ ] Note saved locally when offline
- [ ] Notes restored from storage on app restart
- [ ] Pending notes show in list as "pending"
- [ ] Pending notes sync when online
- [ ] No data loss on offline to online transition

### 5. Synchronization

- Network status monitoring
- Auto-sync every 30 seconds (when online)
- Manual sync trigger
- Merge local and remote changes

**Test Plan:**
- [ ] App detects network changes
- [ ] Auto-sync runs when online
- [ ] Manual sync works
- [ ] Recent notes merge correctly
- [ ] No duplicate notes after sync

## Testing

### Run Tests

```bash
npm test
```

### Test Coverage

```bash
npm test -- --coverage
```

### Test Files

1. **auth.service.test.ts**
   - Token initialization
   - Login/logout flow
   - Token refresh

2. **local-storage.service.test.ts**
   - Save/load notes
   - Delete notes
   - Pending sync tracking

3. **sync.service.test.ts**
   - Network monitoring
   - Auto-sync timing
   - Sync completion

## Debug Features

### Network State Logging

Enable verbose logging:

```typescript
// In SyncService initialization
console.log('Network state:', state.isConnected);
```

### Local Storage Inspector

Check stored data:

```typescript
import { LocalStorageService } from './services/local-storage.service';

const notes = await LocalStorageService.getAllNotes();
console.log('Stored notes:', notes);

const pending = await LocalStorageService.getPendingSyncNotes();
console.log('Pending syncs:', pending);
```

## Common Issues

### Issue: "Cannot find module '@react-native-community/netinfo'"

**Solution:**
```bash
npm install @react-native-community/netinfo
```

### Issue: AsyncStorage not working

**Solution:**
```bash
npm install @react-native-async-storage/async-storage
cd ios && pod install && cd ..
```

### Issue: Metro bundler not starting

**Solution:**
```bash
npm start -- --reset-cache
```

### Issue: Android build fails

**Solution:**
```bash
cd android && ./gradlew clean && cd ..
npm run android
```

## API Endpoints

The app expects these endpoints on backend:

```
POST   /api/auth/google/login       - Google OAuth login
POST   /api/auth/naver/login        - Naver OAuth login
POST   /api/auth/logout             - Logout
POST   /api/auth/refresh            - Refresh token

GET    /api/notes?userId=XXX        - Get user notes
GET    /api/notes/:id               - Get note by ID
POST   /api/notes                   - Create note
PUT    /api/notes/:id               - Update note
DELETE /api/notes/:id               - Delete note

POST   /api/sync/notes              - Batch sync notes
```

## Performance Optimization

### Current Optimizations

1. **Lazy Loading**: Notes loaded on demand
2. **Memoization**: Components use memo for optimization
3. **Batching**: Sync groups multiple changes
4. **Debouncing**: Auto-sync waits for stability

### Future Improvements

1. Add virtual list for large note counts
2. Implement image caching
3. Database query optimization
4. Network request pooling

## Security Considerations

1. **Token Storage**: Stored in AsyncStorage (consider react-native-secure-storage)
2. **API Security**: All requests include Bearer token
3. **Data Validation**: Input validation on all forms
4. **SSL Pinning**: Should be implemented for production

## Deployment

### Build Release APK (Android)

```bash
cd android
./gradlew assembleRelease
cd ..
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

### Build Release IPA (iOS)

```bash
xcodebuild -workspace ios/CalendarApp.xcworkspace \
  -scheme CalendarApp \
  -configuration Release \
  -archivePath ios/CalendarApp.xcarchive \
  archive
```

## Support

For issues or questions:
1. Check test files for usage examples
2. Review error logs in console
3. Check backend API responses
4. Verify network connectivity
