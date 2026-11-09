/** User intent wins over background reloads and late mutation follow-ups. */
export class StatementRequests {
  private revision = 0;
  private date: string | null = null;
  private opening = false;
  private visibleDate: string | null = null;
  open(date: string): number { this.date = date; this.opening = true; return ++this.revision; }
  finishOpen(revision: number): boolean {
    if (!this.current(revision)) return false;
    this.opening = false; this.visibleDate = this.date;
    return true;
  }
  failOpen(revision: number): boolean {
    if (!this.current(revision)) return false;
    this.opening = false; this.date = this.visibleDate;
    return true;
  }
  refresh(date: string | null): number | null {
    if (this.opening || !date || date !== this.date) return null;
    return ++this.revision;
  }
  current(revision: number): boolean { return revision === this.revision; }
  close(): void { this.revision++; this.date = null; this.visibleDate = null; this.opening = false; }
}
