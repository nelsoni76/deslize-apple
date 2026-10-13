import { describe, expect, it } from 'vitest'

import {
  DURACAO_DOS_QUADROS,
  ELASTICO_C,
  MOLA_SUAVE,
  dedoDoElastico,
  derivadaDoElastico,
  elastico,
  limitaVelocidade,
  molaDeDuracao,
  quadrosDaMola,
  quadrosDeTransform,
  translacao,
} from '../src/mola.js'

/**
 * A FÍSICA DO DESLIZE no padrão Apple. O que estes
 * casos travam: o elástico das pontas é o do UIScrollView, a mola é a `.smooth`
 * do iOS 17 (0,5 s, sem quique) e, levando a velocidade do dedo, ela chega
 * mais rápido sem nunca passar do alvo.
 */

const QUADRO_MS = 1000 / 120
const OMEGA = Math.sqrt(MOLA_SUAVE.rigidez / MOLA_SUAVE.massa)

/** O instante (s) do primeiro quadro em que a mola já fez `fracao` do caminho. */
function tempoAte(xs: number[], de: number, ate: number, fracao: number): number {
  const i = xs.findIndex((x) => (x - de) / (ate - de) >= fracao)
  return (i * QUADRO_MS) / 1000
}

/** Quantas vezes a mola cruza o alvo (troca de lado). */
function cruzamentos(xs: number[], ate: number): number {
  let n = 0
  for (let i = 1; i < xs.length; i += 1) {
    const antes = Math.sign(xs[i - 1] - ate)
    const depois = Math.sign(xs[i] - ate)
    if (antes !== 0 && depois !== 0 && antes !== depois) n += 1
  }
  return n
}

describe('o elástico das pontas (UIScrollView, c = 0,55)', () => {
  it('numa tela de 412 px: 50 px de dedo dão 26 na tela; 100 dão 48; 200 dão 87', () => {
    expect(ELASTICO_C).toBe(0.55)
    expect(elastico(50, 412)).toBeCloseTo(25.78, 1)
    expect(elastico(100, 412)).toBeCloseTo(48.53, 1)
    expect(elastico(200, 412)).toBeCloseTo(86.82, 1)
  })

  it('preserva o sinal: o dedo para a esquerda estica para a esquerda', () => {
    expect(elastico(-50, 412)).toBeCloseTo(-25.78, 1)
  })

  it('resiste sempre e nunca passa da largura da vista', () => {
    for (const dx of [1, 10, 400, 5000, 1e6]) {
      expect(elastico(dx, 412)).toBeLessThan(dx)
      expect(elastico(dx, 412)).toBeLessThan(412)
    }
  })

  it('parado é zero, e largura zero não vira NaN', () => {
    expect(elastico(0, 412)).toBe(0)
    expect(elastico(0, 0)).toBe(0)
    expect(elastico(50, 0)).toBe(0)
  })
})

/**
 * DOIS ESPAÇOS na ponta: o do DEDO (`base + dx`) e o da TELA (o que o
 * elástico devolve). Misturar os dois é salto: soltar 100 px de dedo com a tela
 * em 48 e mandar a mola partir de 100; pegar a mola com a tela em 30 e somar o
 * dedo a esse 30 antes do elástico.
 */
describe('o elástico composto: do dedo para a tela e de volta', () => {
  it('a inversa: o dedo que põe a tela em y (ida e volta, sinal preservado)', () => {
    for (const dx of [50, 100, 200, -100, 1000]) {
      expect(dedoDoElastico(elastico(dx, 412), 412)).toBeCloseTo(dx, 6)
    }
    for (const y of [25.78, 48.53, -30]) {
      expect(elastico(dedoDoElastico(y, 412), 412)).toBeCloseTo(y, 9)
    }
  })

  it('parada é zero; a tela na largura não tem dedo que chegue; largura zero não vira NaN', () => {
    expect(dedoDoElastico(0, 412)).toBe(0)
    expect(dedoDoElastico(412, 412)).toBe(Infinity)
    expect(dedoDoElastico(-500, 412)).toBe(-Infinity)
    expect(dedoDoElastico(30, 0)).toBe(0)
  })

  it('a derivada: quanto a tela anda por pixel de dedo — c na origem, 0,43 a 100 px numa tela de 412 px', () => {
    expect(derivadaDoElastico(0, 412)).toBe(ELASTICO_C)
    expect(derivadaDoElastico(100, 412)).toBeCloseTo(0.428, 3)
    expect(derivadaDoElastico(-100, 412)).toBe(derivadaDoElastico(100, 412))
    expect(derivadaDoElastico(100, 0)).toBe(0)
    const h = 1e-4
    for (const x of [10, 100, 200, -150]) {
      const numerica = (elastico(x + h, 412) - elastico(x - h, 412)) / (2 * h)
      expect(derivadaDoElastico(x, 412)).toBeCloseTo(numerica, 6)
    }
  })

  it('pegar a mola de volta NA PONTA guarda base no espaço do dedo: o dedo para fora nunca puxa a tela para trás', () => {
    const tela = 30
    const base = dedoDoElastico(tela, 412)
    expect(elastico(base + 0, 412)).toBeCloseTo(tela, 9)
    expect(elastico(base + 8, 412)).toBeGreaterThan(tela)
    // O salto que isto evita: a tela lida (já elástica) somada ao dedo cru.
    expect(elastico(tela + 8, 412)).toBeLessThan(tela - 9)
  })

  it('soltar NA PONTA indo para fora: com a velocidade da TELA a mola continua o que a tela fazia, sem tranco', () => {
    // 100 px de dedo a 1,5 px/ms: a tela está em 48,5 e anda a 43 % do dedo.
    const tela = elastico(100, 412)
    const daTela = 1500 * derivadaDoElastico(100, 412)
    expect(daTela).toBeCloseTo(642, 0)
    const pico = (v0: number) => Math.max(...quadrosDaMola(tela, 0, limitaVelocidade(v0, -tela, MOLA_SUAVE)))
    expect(pico(daTela)).toBeGreaterThan(56)
    expect(pico(daTela)).toBeLessThan(62)
    // Com a do dedo inteira, o primeiro quadro já correria o dobro da tela.
    expect(pico(1500)).toBeGreaterThan(78)
  })
})

describe('a mola `.smooth` do iOS 17 (WWDC23: duração 0,5 s, quique 0)', () => {
  it('rigidez (2π/d)², amortecimento 4π(1 − quique)/d, massa 1', () => {
    expect(MOLA_SUAVE.rigidez).toBeCloseTo(157.91, 2)
    expect(MOLA_SUAVE.amortecimento).toBeCloseTo(25.13, 2)
    expect(MOLA_SUAVE.massa).toBe(1)
    expect(molaDeDuracao()).toEqual(MOLA_SUAVE)
  })

  it('sem quique é o amortecimento crítico (ζ = 1)', () => {
    const { rigidez, amortecimento, massa } = MOLA_SUAVE
    expect(amortecimento / (2 * Math.sqrt(rigidez * massa))).toBeCloseTo(1, 10)
  })

  it('com quique 0,15 o amortecimento cai a 85 %', () => {
    expect(molaDeDuracao(0.5, 0.15).amortecimento).toBeCloseTo(MOLA_SUAVE.amortecimento * 0.85, 10)
  })
})

describe('os quadros da mola (120 Hz)', () => {
  it('começa onde está e termina EXATAMENTE no alvo (o inline final bate com o último quadro)', () => {
    for (const [de, ate] of [
      [412, 0],
      [0, -412],
      [-80, 0],
      [37.5, 0],
    ]) {
      const xs = quadrosDaMola(de, ate, 0)
      expect(xs[0]).toBe(de)
      expect(xs[xs.length - 1]).toBe(ate)
    }
  })

  it('parada, a mola nunca cruza o alvo e só anda num sentido', () => {
    const xs = quadrosDaMola(412, 0, 0)
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]).toBeLessThanOrEqual(xs[i - 1])
      expect(xs[i]).toBeGreaterThanOrEqual(0)
    }
  })

  it('do repouso: 90 % do caminho em 0,31 s e 98 % em 0,46 s (± 0,01)', () => {
    const xs = quadrosDaMola(412, 0, 0)
    expect(tempoAte(xs, 412, 0, 0.9)).toBeGreaterThanOrEqual(0.3)
    expect(tempoAte(xs, 412, 0, 0.9)).toBeLessThanOrEqual(0.32)
    expect(tempoAte(xs, 412, 0, 0.98)).toBeGreaterThanOrEqual(0.45)
    expect(tempoAte(xs, 412, 0, 0.98)).toBeLessThanOrEqual(0.47)
  })

  it('assenta (< 0,5 px, < 10 px/s) em cerca de 0,7 s numa tela inteira', () => {
    const xs = quadrosDaMola(412, 0, 0)
    expect(DURACAO_DOS_QUADROS(xs.length) / 1000).toBeGreaterThan(0.65)
    expect(DURACAO_DOS_QUADROS(xs.length) / 1000).toBeLessThan(0.75)
  })

  it('só assenta quase parada: o último passo de verdade anda menos que 10 px/s', () => {
    // Parar no meio-pixel ainda correndo é um tranco visível no fim da mola.
    for (const xs of [
      quadrosDaMola(412, 0, 0),
      quadrosDaMola(0, 100, 0, molaDeDuracao(0.5, 0.15)),
      quadrosDaMola(0, 412, 0, molaDeDuracao(0.5, 0.15)),
    ]) {
      const n = xs.length
      expect(Math.abs(xs[n - 2] - xs[n - 3]) * 120).toBeLessThan(10 * 1.2)
    }
  })

  it('levando a velocidade do dedo no sentido do alvo, chega antes', () => {
    const parada = quadrosDaMola(0, 412, 0)
    const lancada = quadrosDaMola(0, 412, 1500)
    expect(tempoAte(lancada, 0, 412, 0.9)).toBeLessThan(tempoAte(parada, 0, 412, 0.9))
    expect(cruzamentos(lancada, 412)).toBe(0)
  })

  it('um flick forte com a velocidade limitada chega rápido e para macio (50 px a 2 px/ms: 90 % em 0,18 s)', () => {
    const xs = quadrosDaMola(0, 50, limitaVelocidade(2000, 50, MOLA_SUAVE))
    expect(tempoAte(xs, 0, 50, 0.9)).toBeGreaterThanOrEqual(0.17)
    expect(tempoAte(xs, 0, 50, 0.9)).toBeLessThanOrEqual(0.2)
    expect(cruzamentos(xs, 50)).toBe(0)
    expect(Math.max(...xs)).toBeLessThanOrEqual(50)
  })

  it('sem o limite, o mesmo flick passaria do alvo (é por isso que ele existe)', () => {
    expect(cruzamentos(quadrosDaMola(0, 50, 2000), 50)).toBe(1)
  })

  it('com quique 0,15 a mola passa do alvo uma vez e volta', () => {
    const xs = quadrosDaMola(0, 100, 0, molaDeDuracao(0.5, 0.15))
    expect(cruzamentos(xs, 100)).toBe(1)
    expect(Math.max(...xs)).toBeGreaterThan(100)
  })

  it('teto de 1500 ms, mesmo numa mola mole, e ainda termina no alvo', () => {
    const xs = quadrosDaMola(412, 0, 0, molaDeDuracao(5))
    expect(DURACAO_DOS_QUADROS(xs.length)).toBeLessThanOrEqual(1500)
    expect(xs[xs.length - 1]).toBe(0)
  })

  it('já parada no alvo: um quadro só (não há o que animar)', () => {
    expect(quadrosDaMola(0, 0, 0)).toEqual([0])
  })

  it('a duração de n quadros a 120 Hz', () => {
    expect(DURACAO_DOS_QUADROS(1)).toBe(0)
    expect(DURACAO_DOS_QUADROS(121)).toBe(1000)
  })
})

describe('o limite da velocidade (bounce 0 de verdade, sem bater na parede)', () => {
  it('no sentido do alvo, corta exatamente em ω·restante (a maior que ainda não cruza)', () => {
    expect(limitaVelocidade(2000, 50, MOLA_SUAVE)).toBeCloseTo(OMEGA * 50, 10)
    expect(limitaVelocidade(-2000, -50, MOLA_SUAVE)).toBeCloseTo(-OMEGA * 50, 10)
  })

  it('abaixo do corte passa intacta', () => {
    expect(limitaVelocidade(300, 50, MOLA_SUAVE)).toBe(300)
    expect(limitaVelocidade(-300, -50, MOLA_SUAVE)).toBe(-300)
  })

  it('no sentido contrário ao alvo, teto de 3000 px/s', () => {
    expect(limitaVelocidade(-5000, 50, MOLA_SUAVE)).toBe(-3000)
    expect(limitaVelocidade(5000, -50, MOLA_SUAVE)).toBe(3000)
    expect(limitaVelocidade(-1000, 50, MOLA_SUAVE)).toBe(-1000)
  })

  it('já no alvo (restante 0) não há o que levar: a mola não sai do lugar', () => {
    // Ali a velocidade seria só um arranco para fora, não a volta — e soltar em
    // x = 0 também não anima nada no hook.
    for (const v0 of [1500, -1500, 3000, -5000]) {
      expect(limitaVelocidade(v0, 0, MOLA_SUAVE)).toBe(0)
      expect(quadrosDaMola(0, 0, limitaVelocidade(v0, 0, MOLA_SUAVE))).toEqual([0])
    }
  })

  it('a excursão no sentido contrário é v0/(ω·e), 1:1 na tela: a escolha fica travada', () => {
    // 5 px antes do alvo, 2,5 px/ms de dedo. Indo para o alvo, a velocidade
    // corta em ω·5 e a tela nunca sai dos 5 px; indo para fora, passa inteira
    // e a tela vai a ~75 px antes de voltar (o "espiar e voltar" do lado com
    // vizinha). Da beira do alvo: ~44 px a 1500 px/s, ~87 no teto de 3000.
    const indo = quadrosDaMola(-5, 0, limitaVelocidade(2500, 5, MOLA_SUAVE))
    expect(Math.min(...indo)).toBe(-5)
    expect(Math.max(...indo)).toBe(0)
    const fora = Math.max(...quadrosDaMola(5, 0, limitaVelocidade(2500, -5, MOLA_SUAVE)))
    expect(fora).toBeGreaterThan(70)
    expect(fora).toBeLessThan(80)
    const beira = (v0: number) => Math.max(...quadrosDaMola(1, 0, limitaVelocidade(v0, -1, MOLA_SUAVE)))
    expect(beira(1500)).toBeGreaterThan(40)
    expect(beira(1500)).toBeLessThan(48)
    expect(beira(5000)).toBeGreaterThan(82)
    expect(beira(5000)).toBeLessThan(92)
  })
})

describe('os quadros viram transform só na camada do DOM', () => {
  it('translate3d em px, com duas casas', () => {
    expect(quadrosDeTransform([0, -12.5, 412.004])).toEqual([
      { transform: 'translate3d(0px,0,0)' },
      { transform: 'translate3d(-12.5px,0,0)' },
      { transform: 'translate3d(412px,0,0)' },
    ])
  })

  it('o resto de arredondamento perto de zero não escreve "-0px"', () => {
    expect(quadrosDeTransform([-0.001])).toEqual([{ transform: 'translate3d(0px,0,0)' }])
  })

  it('o arrasto escreve no MESMO formato dos quadros (a mola parte de onde o dedo deixou)', () => {
    // O `style.transform` do arrasto e o 1º quadro da mola têm de ser a mesma
    // string: qualquer diferença de casas é um degrau no instante da soltura.
    expect(translacao(-80)).toBe('translate3d(-80px,0,0)')
    expect(translacao(48.5312)).toBe('translate3d(48.53px,0,0)')
    expect(translacao(-0.001)).toBe('translate3d(0px,0,0)')
    for (const x of [0, -12.5, 412.004, 33.333]) {
      expect(quadrosDeTransform([x])[0].transform).toBe(translacao(x))
    }
  })
})
