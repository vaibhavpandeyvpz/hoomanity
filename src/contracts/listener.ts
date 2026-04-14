export type RuntimeListener = {
  start: () => Promise<void>;
  stop?: () => Promise<void>;
};
