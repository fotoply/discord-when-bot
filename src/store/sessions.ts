type Session = {
  first?: string; // ISO date for first selection
};

class SessionStore {
  private map = new Map<string, Session>(); // userId -> session

  setFirst(userId: string, first: string) {
    const s = this.map.get(userId) ?? {};
    s.first = first;
    this.map.set(userId, s);
  }

  getFirst(userId: string): string | undefined {
    return this.map.get(userId)?.first;
  }

  clear(userId: string) {
    this.map.delete(userId);
  }
}

export const Sessions = new SessionStore();
