/**
 * Ordena as paradas (índice 0 = cozinha, fixo no início) por vizinho mais
 * próximo e depois melhora com 2-opt, usando a matriz de distâncias reais
 * (metros ou segundos — tanto faz, o algoritmo só compara valores). Se
 * `roundTrip` for true, o custo de voltar pra cozinha entra na otimização.
 */
export function solveRouteOrder(matrix: number[][], roundTrip: boolean): number[] {
  const n = matrix.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);

  const visited = new Array(n).fill(false);
  visited[0] = true;
  let order = [0];
  let current = 0;
  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[current][j] < bestDist) {
        bestDist = matrix[current][j];
        best = j;
      }
    }
    visited[best] = true;
    order.push(best);
    current = best;
  }

  function tourLength(o: number[]): number {
    let len = 0;
    for (let i = 0; i < o.length - 1; i++) len += matrix[o[i]][o[i + 1]];
    if (roundTrip) len += matrix[o[o.length - 1]][o[0]];
    return len;
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        if (tourLength(candidate) < tourLength(order) - 1e-6) {
          order = candidate;
          improved = true;
        }
      }
    }
  }

  return order;
}
