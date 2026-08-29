import { useEffect, useState } from "react";
import { HALLS } from "../domain/halls";
import { chicagoDate } from "../domain/datetime";
import { normalizeHallDay } from "../domain/normalize";
import type { HallDay } from "../domain/types";
import { fetchPeriods } from "../api/client";
import { readCache, writeCache, evictStale } from "../api/cache";

export interface MenusState {
  days: HallDay[];
  loading: boolean;
  error: string | null;
  date: string;
}

export function useMenus(): MenusState {
  const [days, setDays] = useState<HallDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const date = chicagoDate();

  useEffect(() => {
    let cancelled = false;
    evictStale(date);

    async function loadOne(hall: (typeof HALLS)[number]): Promise<HallDay> {
      const cached = readCache(hall.id, date);
      if (cached) return normalizeHallDay(hall, cached as never, date);
      const raw = await fetchPeriods(hall.id, date);
      writeCache(hall.id, date, raw);
      return normalizeHallDay(hall, raw as never, date);
    }

    Promise.all(HALLS.map(loadOne))
      .then((result) => {
        if (!cancelled) {
          setDays(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load menus");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  return { days, loading, error, date };
}
