import { parseScreen, type ScreenDocument } from '@visualtwin/schema'
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export class ScreenHistory {
  private past: ScreenDocument[] = []
  private future: ScreenDocument[] = []
  commit(current: ScreenDocument, next: ScreenDocument) {
    const checked = parseScreen(copy(next))
    if (JSON.stringify(current) === JSON.stringify(checked)) return current
    this.past.push(copy(current)); if (this.past.length > 100) this.past.shift()
    this.future = []; return checked
  }
  undo(current: ScreenDocument) { const value = this.past.pop(); if (!value) return current; this.future.push(copy(current)); return value }
  redo(current: ScreenDocument) { const value = this.future.pop(); if (!value) return current; this.past.push(copy(current)); return value }
}
