export interface HomeSection {
  id: string
  en: string
  it: string
  /** Shown only to people who log workouts in the app. */
  training?: boolean
}
export declare const HOME_SECTIONS: HomeSection[]
export declare function homeOrder(saved: unknown): string[]
