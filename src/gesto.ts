/**
 * DESLIZAR DE LADO — a régua do gesto, em funções PURAS: o que é decisão
 * mora aqui e é testado; quem liga no DOM só lê o dedo e pergunta.
 *
 * Feita para o gesto que vale na tela INTEIRA (trocar de aba, de semana, de
 * página): uma rolagem torta da lista não pode virar troca no meio. Daí:
 * 1. só é de lado com o DOBRO do lado sobre a descida (ângulo < ~27°),
 *    decidido uma vez, no primeiro movimento acima de `LIMIAR_PX`;
 * 2. só troca com 64 px (~15% de uma tela de 412 px), ou com 40 px num flick
 *    (velocidade dos últimos 100 ms — a média desde o toque castigaria o
 *    deslize que começa devagar e termina rápido);
 * 3. as duas bordas são do Android (o gesto de voltar do sistema).
 */

/** Quanto o dedo anda antes de o gesto ser decidido. */
export const LIMIAR_PX = 8
/** De lado = |dx| pelo menos o dobro de |dy|. */
export const RAZAO_DE_LADO = 2
/** Distância que troca sozinha, devagar ou rápido. */
export const DISTANCIA_PX = 64
/** Distância mínima de um flick. */
export const DISTANCIA_DO_FLICK_PX = 40
/** Velocidade de flick, em px/ms. */
export const VELOCIDADE_DO_FLICK = 0.5
/** A janela da velocidade, em ms. */
export const JANELA_MS = 100
/** A faixa de cada borda que fica com o gesto de voltar do Android. */
export const BORDA_PX = 28

export type ClasseDoDeslize = 'indefinido' | 'horizontal' | 'vertical'
export type DirecaoDoDeslize = 'esquerda' | 'direita'
export interface Amostra {
  t: number
  x: number
}

export function classificaDeslize(dx: number, dy: number): ClasseDoDeslize {
  if (Math.abs(dx) < LIMIAR_PX && Math.abs(dy) < LIMIAR_PX) return 'indefinido'
  return Math.abs(dx) >= RAZAO_DE_LADO * Math.abs(dy) ? 'horizontal' : 'vertical'
}

/**
 * px/ms COM SINAL entre a amostra mais antiga da janela e a última (negativo =
 * o dedo indo para a esquerda). O sinal importa: o recuo rápido de quem
 * desistiu é velocidade para o OUTRO lado.
 */
export function velocidadeRecente(amostras: readonly Amostra[], janela = JANELA_MS): number {
  if (amostras.length < 2) return 0
  const ultima = amostras[amostras.length - 1]
  let inicio = amostras.findIndex((a) => a.t >= ultima.t - janela)
  // Só a última na janela (o dedo parou antes de soltar): mede contra a anterior.
  if (inicio === amostras.length - 1) inicio -= 1
  const primeira = amostras[inicio]
  const ms = ultima.t - primeira.t
  return ms > 0 ? (ultima.x - primeira.x) / ms : 0
}

/**
 * Soltou: para que lado troca, ou `null`. `esquerda` = o dedo foi para a
 * esquerda. `velocidade` vem com sinal (`velocidadeRecente`).
 */
export function decideDeslize(gesto: { dx: number; dy: number; velocidade: number }): DirecaoDoDeslize | null {
  const { dx, dy, velocidade } = gesto
  if (Math.abs(dx) < RAZAO_DE_LADO * Math.abs(dy)) return null
  const longe = Math.abs(dx) >= DISTANCIA_PX
  // O flick só vale no MESMO sentido do deslize: ir, parar e puxar de volta
  // rápido é desistir, não um flick para o lado de onde o dedo saiu.
  const flick =
    Math.abs(dx) >= DISTANCIA_DO_FLICK_PX &&
    Math.sign(velocidade) === Math.sign(dx) &&
    Math.abs(velocidade) >= VELOCIDADE_DO_FLICK
  if (!longe && !flick) return null
  return dx < 0 ? 'esquerda' : 'direita'
}

export function comecaNaBorda(x: number, largura: number, borda = BORDA_PX): boolean {
  return x < borda || x > largura - borda
}

/**
 * A aba de destino. O dedo para a esquerda traz a PRÓXIMA (o conteúdo
 * acompanha o dedo, como num calendário); sem dar a volta nas pontas.
 */
export function proximaAba(indice: number, direcao: DirecaoDoDeslize, total: number): number | null {
  if (indice < 0 || indice >= total) return null
  const destino = direcao === 'esquerda' ? indice + 1 : indice - 1
  return destino >= 0 && destino < total ? destino : null
}
