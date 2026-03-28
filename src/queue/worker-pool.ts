export interface WorkerPoolConfig {
  maxGlobalWorkers: number;
  maxWorkersPerRoom: number;
}

export interface WorkerPool {
  tryAcquire(roomKey: string): boolean;
  release(roomKey: string): void;
  snapshot(): {
    globalActive: number;
    roomActive: Record<string, number>;
  };
}

export function createWorkerPool(config: WorkerPoolConfig): WorkerPool {
  const roomActive = new Map<string, number>();
  let globalActive = 0;

  return {
    tryAcquire(roomKey) {
      const activeForRoom = roomActive.get(roomKey) ?? 0;
      if (globalActive >= config.maxGlobalWorkers || activeForRoom >= config.maxWorkersPerRoom) {
        return false;
      }

      roomActive.set(roomKey, activeForRoom + 1);
      globalActive += 1;
      return true;
    },
    release(roomKey) {
      const activeForRoom = roomActive.get(roomKey) ?? 0;
      if (activeForRoom <= 0) {
        return;
      }

      if (activeForRoom === 1) {
        roomActive.delete(roomKey);
      } else {
        roomActive.set(roomKey, activeForRoom - 1);
      }

      globalActive = Math.max(0, globalActive - 1);
    },
    snapshot() {
      return {
        globalActive,
        roomActive: Object.fromEntries(roomActive.entries())
      };
    }
  };
}
