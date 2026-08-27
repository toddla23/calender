import { NotesRepository } from '../db/queries/notes';
import { Note } from '../shared/types/Note';
import {
  CreateNoteRequest,
  ReadNotesRequest,
  UpdateNoteRequest,
  DeleteNoteRequest,
} from '../shared/types/IPC';

export class CrudHandlers {
  private notesRepo: NotesRepository;

  constructor() {
    this.notesRepo = new NotesRepository();
  }

  async createNote(request: CreateNoteRequest): Promise<Note> {
    const note = this.notesRepo.createNote(request.note);
    return note;
  }

  async readNotes(request: ReadNotesRequest): Promise<Note[]> {
    const notes = this.notesRepo.readNotes(
      request.startDate,
      request.endDate,
      request.includeDeleted || false
    );
    return notes;
  }

  async updateNote(request: UpdateNoteRequest): Promise<Note> {
    const note = this.notesRepo.updateNote(request.update.id, request.update);
    return note;
  }

  async deleteNote(request: DeleteNoteRequest): Promise<Note> {
    const note = this.notesRepo.deleteNote(request.id);
    return note;
  }

  async getNoteByDate(request: any): Promise<Note[]> {
    const notes = this.notesRepo.getNotesByDate(request.date);
    return notes;
  }
}
