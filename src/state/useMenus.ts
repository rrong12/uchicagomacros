import { useEffect, useState } from "react";
import { HALLS } from "../domain/halls";
import { chicagoDate } from "../domain/datetime";
import { normalizeHallDay } from "../domain/normalize";
import type { Hall, HallDay, PeriodMenu } from "../domain/types";
import { fetchPeriods, fetchPeriodDetail } from "../api/client";
import { readCache, writeCache, evictStale } from "../api/cache";

export interface MenusState {
  days: HallDay[];
  loading: boolean;
  error: string | null;
  date: string;
}

/** Cache-first fetch of one URL-shaped request. */
async function cached(
  key: string,
  date: string,
  fetcher: () => Promise<unknown>
): Promise<unknown> {
  const hit = readCache(key, date);
  if (hit) return hit;
  const raw = await fetcher();
  writeCache(key, date, raw);
  return raw;
}

/**
 * Load one hall's full day.
 *
 * Two rounds, because a `periods` request returns only the `sort_order: 0`
 * period's items. The first round tells us which periods exist; the second
 * fetches the ones the first didn't include. Closed halls short-circuit after
 * round one.
 */
async function loadHall(hall: Hall, date: string): Promise<HallDay> {
  const base = await cached(hall.id, date, () => fetchPeriods(hall.id, date));
  const day = normalizeHallDay(hall, base as never, date);
  if (day.closed) return day;

  const already = new Set(day.menus.map((m) => m.name));
  const missing = day.periods.filter((p) => !already.has(p.name));
  if (missing.length === 0) return day;

  const extra = await Promise.all(
    missing.map(async (p): Promise<PeriodMenu | null> => {
      try {
        const raw = await cached(`${hall.id}:${p.id}`, date, () =>
          fetchPeriodDetail(hall.id, p.id, date)
        );
        const detail = normalizeHallDay(hall, raw as never, date);
        return detail.menus[0] ?? null;
      } catch {
        // One period failing shouldn't blank out the whole hall — the user
        // still gets every period that did load.
        return null;
      }
    })
  );

  const menus = [...day.menus, ...extra.filter((m): m is PeriodMenu => m !== null)];
  // Present periods in the order the API lists them (Breakfast, Lunch, Dinner),
  // not the order the requests happened to resolve in.
  const order = new Map(day.periods.map((p, i) => [p.name, i]));
  menus.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));

  return { ...day, menus };
}

export function useMenus(): MenusState {
  const [days, setDays] = useState<HallDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const date = chicagoDate();

  useEffect(() => {
    let cancelled = false;
    evictStale(date);

    Promise.all(HALLS.map((hall) => loadHall(hall, date)))
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
