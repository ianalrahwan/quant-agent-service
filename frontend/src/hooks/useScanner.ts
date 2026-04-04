"use client";

import useSWR from "swr";
import type { ScanResult } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useScanner() {
  const { data, error, isLoading, mutate } = useSWR<ScanResult[]>(
    "/api/scanner",
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 120_000, // Refresh every 2 minutes
    }
  );

  return {
    results: data ?? [],
    error,
    isLoading,
    refresh: () => mutate(),
  };
}
