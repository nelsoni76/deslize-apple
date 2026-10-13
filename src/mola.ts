/**
 * A FÍSICA DO DESLIZE, no padrão Apple — funções PURAS (o molde é o
 * `gesto.ts`: o que é conta mora aqui e é testado em Node; quem mexe no DOM
 * só pede os números).
 *
 * As três peças da Apple, e de onde vêm:
 * 1. ELÁSTICO nas pontas (UIScrollView): fora dos limites a tela anda
 *    `(1 − 1/(x·c/d + 1))·d`, c = 0,55, d = a largura da vista. A Apple não
 *    publica o algoritmo; o 0,55 é a aproximação empírica consagrada (Ole
 *    Begemann, 2014), a mesma que o Flutter copia "do iOS".
 * 2. MOLA ao soltar (iOS 17, WWDC23 "Animate with springs"): a `.smooth` é
 *    0,5 s sem quique — rigidez (2π/d)², amortecimento 4π(1 − quique)/d,
 *    massa 1. A velocidade do dedo entra como velocidade inicial.
 * 3. PROJEÇÃO (WWDC18 "Designing Fluid Interfaces"): o destino pela posição
 *    projetada, `dx + 99·v` (v em px/ms, desaceleração 0,99 da paginação).
 *    Fica SÓ documentada: a régua dos 64 px / flick de 40 px continua sendo a
 *    do `gesto.ts`. A "meia tela projetada" da Apple (206 px numa tela de
 *    412 px) num flick de 40 px pediria 1,7 px/ms; a régua usa 0,5.
 *
 * Unidades: posição em px, velocidade da MOLA em px/s (o núcleo do gesto mede
 * em px/ms; quem anima multiplica por 1000). Os exemplos com números são de
 * uma tela de 412 px a 120 Hz.
 */

/** O "c" do elástico do UIScrollView. */
export const ELASTICO_C = 0.55

/**
 * Quanto a tela anda quando o dedo puxa `dx` para além do limite (sinal
 * preservado). Numa tela de 412 px: 50 px de dedo → 26 na tela; 100 → 48; 200 → 87.
 */
export function elastico(dx: number, largura: number, c = ELASTICO_C): number {
  if (dx === 0 || largura <= 0) return 0
  return Math.sign(dx) * (1 - 1 / ((Math.abs(dx) * c) / largura + 1)) * largura
}

/*
 * DOIS ESPAÇOS na ponta: o do DEDO (`base + dx`) e o
 * da TELA (o que `elastico` devolve). A conta é sempre feita no do dedo e só
 * no fim vira tela; misturar os dois é salto. As duas funções abaixo fecham a
 * composição para quem anima.
 */

/**
 * A inversa do `elastico`: o dedo que põe a tela em `y` (sinal preservado).
 * Quem pega uma mola de volta NA PONTA lê a posição da tela, já elástica, e
 * guarda `base = dedoDoElastico(lida, largura)`; daí a tela fica em
 * `elastico(base + dx, largura)` e o primeiro movimento não pula para trás.
 * Com a tela na largura ou além, não há dedo que chegue: ±Infinity.
 */
export function dedoDoElastico(y: number, largura: number, c = ELASTICO_C): number {
  if (y === 0 || largura <= 0) return 0
  const a = Math.abs(y)
  if (a >= largura) return Math.sign(y) * Infinity
  return Math.sign(y) * (largura / c) * (a / (largura - a))
}

/**
 * Quanto a tela anda por pixel de dedo no elástico, com o dedo em `x`:
 * `c / (|x|·c/d + 1)²` — 0,55 na origem, 0,43 a 100 px numa tela de 412 px. Na ponta a
 * velocidade da TELA é a do dedo vezes isto, e é com ela que a mola de volta
 * parte: com a do dedo inteira, o primeiro quadro correria o dobro do que a
 * tela corria.
 */
export function derivadaDoElastico(x: number, largura: number, c = ELASTICO_C): number {
  if (largura <= 0) return 0
  return c / ((Math.abs(x) * c) / largura + 1) ** 2
}

export interface Mola {
  rigidez: number
  amortecimento: number
  massa: number
}

/** A mola do SwiftUI pela duração (s) e pelo quique (0 = amortecimento crítico). */
export function molaDeDuracao(duracao = 0.5, quique = 0): Mola {
  return {
    rigidez: ((2 * Math.PI) / duracao) ** 2,
    amortecimento: (4 * Math.PI * (1 - quique)) / duracao,
    massa: 1,
  }
}

/**
 * A `.smooth` do iOS 17: k = 157,9, c = 25,1 (ζ = 1, ω = 12,57 rad/s). Do
 * repouso: 90 % do caminho em 0,31 s, 98 % em 0,46 s, assentada em ≈ 0,7 s.
 */
export const MOLA_SUAVE = molaDeDuracao(0.5, 0)

/** A tela pinta a 120 Hz; entre dois quadros o navegador interpola em linha reta. */
const QUADROS_POR_SEGUNDO = 120
/** Passos da integração por quadro: 8 × 1/960 s ≈ 1 ms cada. */
const PASSOS_POR_QUADRO = 8
const TETO_MS = 1500
/** Assentou: a menos de meio pixel e quase parada. */
const ASSENTOU_PX = 0.5
const ASSENTOU_PX_POR_S = 10
/** Para longe do alvo (o dedo puxou de volta), a mola parte com até isto. */
const VELOCIDADE_CONTRARIA_MAX = 3000

/** Quanto duram `n` quadros a 120 Hz, em ms (a duração do `element.animate`). */
export const DURACAO_DOS_QUADROS = (n: number) => ((n - 1) * 1000) / QUADROS_POR_SEGUNDO

/**
 * As posições a cada 1000/120 ms, de `de` até `ate`, partindo com `v0` (px/s).
 * Integração semi-implícita (Euler) a ≈ 1 ms; para quando |x − ate| < 0,5 px
 * e |v| < 10 px/s, com teto de 1500 ms. O ÚLTIMO quadro é sempre `ate` exato:
 * quem anima escreve esse valor inline ANTES de animar (`fill: none`), e o fim
 * da animação não pode pular nem meio pixel. Um quadro só = já estava lá.
 *
 * Para nunca passar do alvo com o dedo lançado, a velocidade passa antes por
 * `limitaVelocidade`.
 */
export function quadrosDaMola(de: number, ate: number, v0: number, mola: Mola = MOLA_SUAVE): number[] {
  const { rigidez, amortecimento, massa } = mola
  const dt = 1 / (QUADROS_POR_SEGUNDO * PASSOS_POR_QUADRO)
  const ultimo = (TETO_MS * QUADROS_POR_SEGUNDO) / 1000
  const xs: number[] = []
  let x = de
  let v = v0
  for (let quadro = 0; ; quadro += 1) {
    const assentou = Math.abs(x - ate) < ASSENTOU_PX && Math.abs(v) < ASSENTOU_PX_POR_S
    if (assentou || quadro >= ultimo) {
      xs.push(ate)
      return xs
    }
    xs.push(x)
    for (let passo = 0; passo < PASSOS_POR_QUADRO; passo += 1) {
      v += ((-rigidez * (x - ate) - amortecimento * v) / massa) * dt
      x += v * dt
    }
  }
}

/**
 * A velocidade inicial que a mola aceita. `restante` = alvo − posição, com
 * sinal.
 * - Já no alvo (`restante` 0): nenhuma. Ali a velocidade só seria um arranco
 *   para fora, não a volta — e soltar em x = 0 não anima nada.
 * - No sentido do alvo, no máximo `ω·restante`: a maior que, no amortecimento
 *   crítico, ainda não cruza o alvo — sem quique de verdade, sem "bater na
 *   parede" de um `clamp` (50 px a 2 px/ms chegam a 90 % em 0,18 s e param
 *   macio).
 * - No sentido contrário (o dedo puxou de volta), até 3000 px/s. A tela vai
 *   além de onde estava cerca de v0/(ω·e) antes de voltar, 1:1: ~44 px a
 *   1500 px/s, ~87 no teto; 2,5 px/ms soltos a 5 px do alvo, ~75 px. No lado
 *   com vizinha é o "espiar e voltar"; na ponta a mola já entra com a
 *   velocidade da TELA (`derivadaDoElastico`), cerca da metade.
 */
export function limitaVelocidade(v0: number, restante: number, mola: Mola): number {
  if (restante === 0) return 0
  if (Math.sign(v0) === Math.sign(restante)) {
    const teto = Math.sqrt(mola.rigidez / mola.massa) * Math.abs(restante)
    return Math.abs(v0) > teto ? Math.sign(v0) * teto : v0
  }
  return Math.abs(v0) > VELOCIDADE_CONTRARIA_MAX ? Math.sign(v0) * VELOCIDADE_CONTRARIA_MAX : v0
}

/**
 * Uma posição como `transform`. Duas casas bastam; o resto perto de zero não
 * vira "-0px" (`String(-0)` já é "0"). O arrasto escreve com ela e os quadros
 * da mola também: a mola parte EXATAMENTE da string que o dedo deixou.
 */
export function translacao(x: number): string {
  return `translate3d(${Math.round(x * 100) / 100}px,0,0)`
}

/** Os quadros como keyframes de `transform` (para `element.animate` com `easing: 'linear'`). */
export function quadrosDeTransform(xs: number[]): Keyframe[] {
  return xs.map((x) => ({ transform: translacao(x) }))
}
