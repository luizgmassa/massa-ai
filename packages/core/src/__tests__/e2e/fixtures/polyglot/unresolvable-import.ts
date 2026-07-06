// E10/E11 supplementary: an unresolvable relative import. The indexer's alias
// resolver cannot map "./does-not-exist" to a real file → the import edge is
// recorded with to_file = NULL (PageRank-disconnected / dangling specifier).
import { ghost } from "./does-not-exist";

export function usesGhost(x: number): number {
  try {
    return ghost(x);
  } catch {
    return -1;
  }
}
