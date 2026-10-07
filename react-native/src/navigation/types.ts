export type RootStackParamList = {
  Login: undefined;
  Calendar: undefined;
  DayDetail: { date: string };
  NoteEdit: { date: string; noteId?: string };
  Search: undefined;
  Settings: undefined;
};
