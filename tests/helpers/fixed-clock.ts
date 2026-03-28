export interface FixedClock {
  now(): string;
  peek(): string;
  advanceMilliseconds(milliseconds: number): string;
  advanceSeconds(seconds: number): string;
  advanceMinutes(minutes: number): string;
  set(value: string | Date): string;
}

export function createFixedClock(startAt: string | Date): FixedClock {
  let currentMs = Date.parse(typeof startAt === "string" ? startAt : startAt.toISOString());
  if (!Number.isFinite(currentMs)) {
    throw new Error(`invalid fixed clock start time: ${String(startAt)}`);
  }

  const toIso = () => new Date(currentMs).toISOString();

  return {
    now() {
      return toIso();
    },
    peek() {
      return toIso();
    },
    advanceMilliseconds(milliseconds: number) {
      currentMs += milliseconds;
      return toIso();
    },
    advanceSeconds(seconds: number) {
      currentMs += seconds * 1000;
      return toIso();
    },
    advanceMinutes(minutes: number) {
      currentMs += minutes * 60 * 1000;
      return toIso();
    },
    set(value: string | Date) {
      currentMs = Date.parse(typeof value === "string" ? value : value.toISOString());
      if (!Number.isFinite(currentMs)) {
        throw new Error(`invalid fixed clock value: ${String(value)}`);
      }
      return toIso();
    }
  };
}
