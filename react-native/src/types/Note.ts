export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  synced: boolean;
}
