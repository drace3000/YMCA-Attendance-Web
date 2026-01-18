import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type UsHolidaysJson = {
  title?: string;
  holidays: Array<{
    name: string;
    dates: Record<
      string,
      {
        date: string;
        day?: string;
        observed?: string;
      }
    >;
  }>;
};

function resolveDocumentsPath(rel: string): string {
  // app/api/.../route.ts runs with cwd typically at web/
  // documents/ is at repo root, so resolve from ../
  return path.join(process.cwd(), "..", rel);
}

export async function loadUsFederalHolidaysJson(): Promise<UsHolidaysJson> {
  const filePath = resolveDocumentsPath("documents/usa-holidays-2024-2027.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as UsHolidaysJson;
}

