export type PersistedPricePoint = {
  time: number;
  binance: number | null;
  bybit: number | null;
  coinbase: number | null;
};

export type PersistedSpreadPoint = {
  time: number;
  binance_bybit: number;
  binance_coinbase: number;
  bybit_coinbase: number;
  best: number;
};

type PersistedChartState = {
  priceData: PersistedPricePoint[];
  spreadData: PersistedSpreadPoint[];
};

const EMPTY_STATE: PersistedChartState = {
  priceData: [],
  spreadData: [],
};

export function loadChartState(storageKey: string): PersistedChartState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedChartState>;

    const priceData = Array.isArray(parsed.priceData)
      ? parsed.priceData
          .filter((row) => Number.isFinite(Number(row?.time)))
          .slice(-240)
          .map((row) => ({
            time: Number(row.time),
            binance: row.binance === null ? null : Number(row.binance),
            bybit: row.bybit === null ? null : Number(row.bybit),
            coinbase: row.coinbase === null ? null : Number(row.coinbase),
          }))
      : [];

    const spreadData = Array.isArray(parsed.spreadData)
      ? parsed.spreadData
          .filter((row) => Number.isFinite(Number(row?.time)))
          .slice(-240)
          .map((row) => ({
            time: Number(row.time),
            binance_bybit: Number(row.binance_bybit || 0),
            binance_coinbase: Number(row.binance_coinbase || 0),
            bybit_coinbase: Number(row.bybit_coinbase || 0),
            best: Number(row.best || 0),
          }))
      : [];

    return { priceData, spreadData };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveChartState(storageKey: string, state: PersistedChartState) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        priceData: state.priceData.slice(-240),
        spreadData: state.spreadData.slice(-240),
      })
    );
  } catch {
    // Ignore storage quota and serialization failures.
  }
}
