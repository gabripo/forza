export interface ImportResult {
  profile: number
  templates: number
  sessions: number
  sets: number
  weights: number
  food: number
  custom_exercises: number
}

export function importHistory(
  /** A Supabase client: the person's own (app) or the service-role one (Forza! Coach). */
  db: object,
  userId: string,
  data: unknown,
  options?: { byCoach?: boolean; onProgress?: (text: string) => void },
): Promise<ImportResult>
