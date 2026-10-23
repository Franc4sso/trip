import { describe, expect, it } from 'vitest';
import { LocateSchema, locateTask } from './locate';

describe('locate', () => {
    it('tells the model what to find, where, and what the group already wrote', () => {
        const task = locateTask({ query: 'Hotel a Namba', city: 'Osaka', hint: 'Namba 2-chome', kind: 'stay' });
        expect(task).toContain('alloggio «Hotel a Namba»');
        expect(task).toContain('Città: Osaka');
        expect(task).toContain('Namba 2-chome');
    });

    it('leaves out what is unknown', () => {
        expect(locateTask({ query: 'Onsen', kind: 'activity' })).toBe('Cosa cercare: attività o luogo «Onsen»');
    });

    it('accepts candidates without coordinates and an empty answer', () => {
        expect(LocateSchema.parse({ candidates: [] }).candidates).toEqual([]);
        const parsed = LocateSchema.parse({
            candidates: [{ name: 'Cross Hotel Osaka', address: '2-5-15 Shinsaibashisuji, Chuo-ku, Osaka', city: 'Osaka', latitude: null, longitude: null, confidence: 'medium', note: 'A due passi da Dotonbori' }],
        });
        expect(parsed.candidates[0].latitude).toBeNull();
    });
});
