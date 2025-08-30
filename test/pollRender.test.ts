import {describe, expect, it} from 'vitest';
import {NONE_SELECTION, Polls} from '../src/store/polls.js';
import {componentsFor, renderPollContent} from '../src/util/pollRender.js';
import type {ActionRowBuilder, ButtonBuilder} from 'discord.js';

describe('pollRender util', () => {
    it('renderPollContent shows dates and voters correctly when no votes', () => {
        const poll = Polls.createPoll({channelId: 'chan-r1', creatorId: 'c1', dates: ['2025-08-30', '2025-08-31']});

        const content = renderPollContent(poll);
        expect(content).toContain('Per-date availability:');
        expect(content).toMatch(/• .* — -/);
        expect(content).toContain('Voters: -');
    });

    it('componentsFor includes control buttons and per-date buttons', () => {
        const poll = Polls.createPoll({channelId: 'chan-r2', creatorId: 'c2', dates: ['2025-08-30']});
        const rows = componentsFor(poll) as ActionRowBuilder<ButtonBuilder>[];

        expect(rows.length).toBeGreaterThan(0);
        const last = rows[rows.length - 1]!; // asserted non-null after length check
        const labels = last.components.map((c) => (c as any).data?.label as string | undefined);

        expect(labels).toContain('Toggle all');
        expect(labels).toContain('Close poll');
    });

    it('shows star prefix when all voters are available for a date', () => {
        const poll = Polls.createPoll({channelId: 'chan-r3', creatorId: 'c3', dates: ['2025-08-30', '2025-08-31']});
        Polls.toggleAll(poll.id, 'u1');
        Polls.toggleAll(poll.id, 'u2');

        const rows = componentsFor(poll) as ActionRowBuilder<ButtonBuilder>[];
        const perDateRows = rows.slice(0, Math.max(0, rows.length - 1));

        let foundStar = false;
        for (const r of perDateRows) {
            for (const comp of r.components as ButtonBuilder[]) {
                const label = (comp as any).data?.label as string | undefined;
                if (label && label.startsWith('⭐ ')) {
                    foundStar = true;
                    break;
                }
            }
            if (foundStar) break;
        }

        expect(foundStar).toBe(true);

        const content = renderPollContent(poll);
        expect(content).toContain('⭐ ');
    });

    it('none selection appears as button but not in per-date list', () => {
        const poll = Polls.createPoll({channelId: 'chan-r4', creatorId: 'c4', dates: ['2025-08-30']});
        Polls.toggle(poll.id, NONE_SELECTION, 'u-none');

        const content = renderPollContent(poll);
        expect(content).not.toContain(NONE_SELECTION);
        expect(content).toContain('<@u-none>');

        const rows = componentsFor(poll) as ActionRowBuilder<ButtonBuilder>[];
        const hasNone = rows.some((r) =>
            r.components.some((c) => ((c as any).data?.label as string | undefined)?.includes('None of these dates')),
        );
        expect(hasNone).toBe(true);
    });

    it('componentsFor returns empty when poll is closed and render shows CLOSED', () => {
        const poll = Polls.createPoll({channelId: 'chan-closed', creatorId: 'c-closed', dates: ['2025-08-30']});
        Polls.close(poll.id);

        const rows = componentsFor(poll);
        expect(rows.length).toBe(0);

        const content = renderPollContent(poll);
        expect(content).toContain('CLOSED');
    });

    it('componentsFor paginates buttons into rows of up to 5', () => {
        const dates: string[] = [];
        for (let i = 0; i < 12; i++) {
            const day = 30 + i;
            dates.push(`2025-09-${String(day).padStart(2, '0')}`);
        }
        const poll = Polls.createPoll({channelId: 'chan-many', creatorId: 'c-many', dates});

        const rows = componentsFor(poll) as ActionRowBuilder<ButtonBuilder>[];
        expect(rows.length).toBeGreaterThan(2);

        const nonControlRows = rows.slice(0, Math.max(0, rows.length - 1));
        for (const r of nonControlRows) {
            expect((r.components as ButtonBuilder[]).length).toBeLessThanOrEqual(5);
        }
    });
});
