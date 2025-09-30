export type Hits<T = Record<string, any>> = Array<Hit<T>>

export type Hit<T = Record<string, any>> = T & {
  _formatted?: Partial<T>
  _matchesPosition?: MatchesPosition<T>
  _rankingScore?: number
  _rankingScoreDetails?: RankingScoreDetails
}

export type MatchesPosition<T> = Partial<
  Record<keyof T, Array<{ start: number; length: number }>>
>

export type RankingScoreDetails = {
  words?: {
    order: number
    matchingWords: number
    maxMatchingWords: number
    score: number
  }
  typo?: {
    order: number
    typoCount: number
    maxTypoCount: number
    score: number
  }
  proximity?: {
    order: number
    score: number
  }
  attribute?: {
    order: number
    attributes_ranking_order: number
    attributes_query_word_order: number
    score: number
  }
  exactness?: {
    order: number
    matchType: string
    score: number
  }
  [key: string]: Record<string, any> | undefined
}