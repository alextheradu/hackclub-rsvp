export const ROSTER_STATUSES = ["confirmed", "waitlisted", "cancelled"] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];
export type RosterFilter = { status ?: RosterStatus; q?: string };

type Param = string | string[] | undefined;

function first (value: Param): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function isRosterStatus (value: string | undefined): value is RosterStatus {
    return ROSTER_STATUSES.includes(value as RosterStatus);
}

export function parseRosterFilter (params: { status?: Param; q?: Param }): RosterFilter {
    const filter: RosterFilter = {};
    const status = first(params.status);
    if (isRosterStatus(status)) {
        filter.status = status;
    }
    const q = first(params.q)?.trim().slice(0, 100);
    if (q) {
        filter.q = q;
    }
    return filter;
}

export function likePattern (text: string): string {
    return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}