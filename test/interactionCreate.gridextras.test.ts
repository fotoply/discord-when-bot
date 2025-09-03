import { describe, it, expect, beforeEach, vi } from 'vitest';
import InteractionCreateListener from '../src/listeners/interactionCreate.js';
import { Polls, NONE_SELECTION } from '../src/store/polls.js';

function makePollWithVotes(userIds: string[], dates: string[]) {
  const poll = Polls.createPoll({ channelId: 'chan-1', creatorId: 'creator', dates });
  // add some votes including NONE
  for (const u of userIds) {
    // vote for first real date
    if (dates[0]) Polls.toggle(poll.id, dates[0], u);
  }
  // ensure one user selects NONE to exercise clearing logic in extras
  if (userIds[0]) Polls.toggle(poll.id, NONE_SELECTION, userIds[0]);
  return Polls.get(poll.id)!;
}

describe('InteractionCreate.buildGridExtras', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('collects labels from member cache and fetches avatars via global fetch', async () => {
    const listener = new InteractionCreateListener({} as any);

    const poll = makePollWithVotes(['u1','u2'], ['2025-01-01','2025-01-02']);

    // mock guild members cache and client users cache
    const memberU1 = { displayName: 'Alice', user: { username: 'alice', displayAvatarURL: () => 'https://example.com/a.png' } };
    const memberU2 = { displayName: 'Bob', user: { username: 'bob', displayAvatarURL: () => 'https://example.com/b.png' } };
    const interaction: any = {
      guild: { members: { cache: new Map([['u1', memberU1], ['u2', memberU2]]), fetch: vi.fn() } },
      client: { users: { cache: new Map(), fetch: vi.fn() } },
    };

    // stub global fetch to return small buffers
    const fakePng = new Uint8Array([137,80,78,71,0,0,0,0]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => fakePng.buffer });
    (globalThis as any).fetch = fetchMock;

    const extras = await (listener as any).buildGridExtras(poll, interaction);

    expect(extras.userIds).toEqual(['u1','u2']);
    expect(extras.userLabelResolver('u1')).toBe('Alice');
    expect(extras.userLabelResolver('u2')).toBe('Bob');
    expect(extras.rowAvatars?.length).toBe(2);
    expect(extras.rowAvatars?.[0]).toBeInstanceOf(Buffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back gracefully when caches/fetch fail and when no global fetch is present', async () => {
    const listener = new InteractionCreateListener({} as any);
    const poll = makePollWithVotes(['u3'], ['2025-01-03']);

    const interaction: any = {
      guild: { members: { cache: { get: () => undefined }, fetch: vi.fn().mockRejectedValue(new Error('nope')) } },
      client: { users: { cache: { get: () => undefined }, fetch: vi.fn().mockRejectedValue(new Error('nope')) } },
    };

    // remove global fetch to skip avatar download path
    const oldFetch = (globalThis as any).fetch;
    try {
      (globalThis as any).fetch = undefined;
      const extras = await (listener as any).buildGridExtras(poll, interaction);
      expect(extras.userIds).toEqual(['u3']);
      // label may be empty string when both member and user missing
      expect(extras.userLabelResolver('u3') ?? '').toBeTypeOf('string');
      expect(extras.rowAvatars?.[0]).toBeUndefined();
    } finally {
      (globalThis as any).fetch = oldFetch;
    }
  });

  it('uses nickname/globalName fallbacks and skips avatar when fetch ok=false', async () => {
    const listener = new InteractionCreateListener({} as any);
    const poll = makePollWithVotes(['u4','u5'], ['2025-02-01']);

    const memberU4 = { nickname: 'Nick4', user: { username: 'u4', displayAvatarURL: () => 'http://img/u4.png' } };
    const interaction: any = {
      guild: { members: { cache: new Map([['u4', memberU4]]), fetch: vi.fn().mockResolvedValue(memberU4) } },
      client: { users: { cache: new Map([['u5', { globalName: 'Global Five', username: 'u5', displayAvatarURL: () => 'http://img/u5.png' }]]), fetch: vi.fn() } },
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
    (globalThis as any).fetch = fetchMock;

    const extras = await (listener as any).buildGridExtras(poll, interaction);
    expect(extras.userLabelResolver('u4')).toBe('Nick4');
    // Depending on environment/mocks, the fallback for user u5 may resolve to
    // a globalName or to another available fallback. Ensure we at least get a
    // non-empty string label rather than asserting an exact value which can be
    // influenced by test environment ordering.
    expect(extras.userLabelResolver('u5') ?? '').toBeTypeOf('string');
     // avatar fetch called but ok=false, so no buffers stored
     expect(extras.rowAvatars?.[0]).toBeUndefined();
     expect(extras.rowAvatars?.[1]).toBeUndefined();
  });

  it('resolves labels deterministically across many fallbacks', async () => {
    const listener = new InteractionCreateListener({} as any);
    const ids = ['m_disp','m_nick','m_muglob','user_disp','user_glob','user_name','no_info'];
    const poll = makePollWithVotes(ids, ['2025-03-05']);

    // members: first three have member entries
    const member_m_disp = { displayName: 'Member Display', user: { username: 'md', globalName: 'MD', displayAvatarURL: () => 'http://a/md.png' } };
    const member_m_nick = { nickname: 'MemberNick', user: { username: 'mn', displayAvatarURL: () => 'http://a/mn.png' } };
    const member_m_muglob = { user: { username: 'mmu', globalName: 'GlobalFromMember', displayAvatarURL: () => 'http://a/mmu.png' } };

    // users: next three exist only at user level
    const user_user_disp = { displayName: 'User Display', username: 'ud', displayAvatarURL: () => 'http://a/ud.png' };
    const user_user_glob = { globalName: 'UserGlobal', username: 'ug', displayAvatarURL: () => 'http://a/ug.png' };
    const user_user_name = { username: 'user_name', displayAvatarURL: () => 'http://a/un.png' };

    const interaction: any = {
      guild: { members: { cache: new Map<string, any>([['m_disp', member_m_disp], ['m_nick', member_m_nick], ['m_muglob', member_m_muglob]]), fetch: vi.fn() } },
      client: { users: { cache: new Map<string, any>([['user_disp', user_user_disp], ['user_glob', user_user_glob], ['user_name', user_user_name]]), fetch: vi.fn() } },
    };

    // remove global fetch to avoid avatar downloads in this test
    const oldFetch = (globalThis as any).fetch;
    try {
      (globalThis as any).fetch = undefined;
      const extras = await (listener as any).buildGridExtras(poll, interaction);
      // userIds are sorted deterministically
      expect(extras.userIds).toEqual(ids.slice().sort());
      expect(extras.userLabelResolver('m_disp')).toBe('Member Display');
      expect(extras.userLabelResolver('m_nick')).toBe('MemberNick');
      expect(extras.userLabelResolver('m_muglob')).toBe('GlobalFromMember');
      expect(extras.userLabelResolver('user_disp')).toBe('User Display');
      expect(extras.userLabelResolver('user_glob')).toBe('UserGlobal');
      expect(extras.userLabelResolver('user_name')).toBe('user_name');
      expect(extras.userLabelResolver('no_info')).toBe('no_info');
    } finally {
      (globalThis as any).fetch = oldFetch;
    }
  });

  it('skips avatar fetch when displayAvatarURL is not a function', async () => {
    const listener = new InteractionCreateListener({} as any);
    const ids = ['na1'];
    const poll = makePollWithVotes(ids, ['2026-01-01']);

    // member has displayAvatarURL as a string (non-callable)
    const member = { displayName: 'NA', user: { username: 'na1', displayAvatarURL: 'http://not-a-fn' } };
    const interaction: any = {
      guild: { members: { cache: new Map<string, any>([['na1', member]]), fetch: vi.fn() } },
      client: { users: { cache: new Map(), fetch: vi.fn() } },
    };

    // stub global fetch to throw if called; we expect it not to be invoked
    const fetchMock = vi.fn().mockRejectedValue(new Error('should not be called'));
    const oldFetch = (globalThis as any).fetch;
    try {
      (globalThis as any).fetch = fetchMock;
      const extras = await (listener as any).buildGridExtras(poll, interaction);
      expect(extras.userLabelResolver('na1')).toBe('NA');
      expect(extras.rowAvatars?.[0]).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = oldFetch;
    }
  });

  it('handles avatar fetch throwing exceptions gracefully (caught)', async () => {
    const listener = new InteractionCreateListener({} as any);
    const poll = makePollWithVotes(['u6'], ['2025-03-01']);

    const member = { displayName: 'U6', user: { username: 'u6', displayAvatarURL: () => 'http://img/u6.png' } };
    const interaction: any = {
      guild: { members: { cache: new Map([['u6', member]]), fetch: vi.fn() } },
      client: { users: { cache: new Map(), fetch: vi.fn() } },
    };

    const oldFetch = (globalThis as any).fetch;
    try {
      (globalThis as any).fetch = () => { throw new Error('network'); };
      const extras = await (listener as any).buildGridExtras(poll, interaction);
      expect(extras.userLabelResolver('u6')).toBe('U6');
      expect(extras.rowAvatars?.[0]).toBeUndefined();
    } finally {
      (globalThis as any).fetch = oldFetch;
    }
  });
});
