type Session = {
  first?: string; // ISO date for first selection
  roles?: string[]; // selected role ids for pings
  pageStart?: number; // pagination start index for first-date picker
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

  setRoles(userId: string, roles: string[]) {
    const s = this.map.get(userId) ?? {};
    s.roles = [...new Set(roles)];
    this.map.set(userId, s);
  }

  getRoles(userId: string): string[] | undefined {
    return this.map.get(userId)?.roles;
  }

  setPageStart(userId: string, start: number) {
    const s = this.map.get(userId) ?? {};
    s.pageStart = Math.max(0, Math.floor(start));
    this.map.set(userId, s);
  }

  getPageStart(userId: string): number {
    return this.map.get(userId)?.pageStart ?? 0;
  }

  clear(userId: string) {
    this.map.delete(userId);
  }
}

export const Sessions = new SessionStore();
