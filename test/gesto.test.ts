import { describe, expect, it } from 'vitest'

import {
  BORDA_PX,
  classificaDeslize,
  comecaNaBorda,
  decideDeslize,
  proximaAba,
  velocidadeRecente,
} from '../src/gesto.js'

/**
 * DESLIZAR A TELA TROCA A ABA. O que estes casos travam:
 * rolar a lista torto continua sendo rolar, e o dedo tremido não troca nada.
 */
describe('a classificação do deslize, decidida uma vez por gesto', () => {
  it('abaixo de 8 px nos dois eixos ainda não é nada', () => {
    expect(classificaDeslize(7, 7)).toBe('indefinido')
    expect(classificaDeslize(-7, 0)).toBe('indefinido')
  })

  it('é deslize de lado só com o dobro do lado sobre a descida (ângulo < ~27°)', () => {
    expect(classificaDeslize(20, 5)).toBe('horizontal')
    expect(classificaDeslize(-20, 10)).toBe('horizontal')
  })

  it('rolagem torta da lista continua sendo rolagem (uma régua 1:1 trocaria a aba)', () => {
    expect(classificaDeslize(20, 12)).toBe('vertical')
    expect(classificaDeslize(9, 30)).toBe('vertical')
  })
})

describe('a velocidade dos últimos 100 ms (o flick que começa devagar conta)', () => {
  it('mede só a janela recente, não a média desde o toque', () => {
    // 300 ms parado quase no lugar, depois 60 px em 60 ms.
    const amostras = [
      { t: 0, x: 200 },
      { t: 300, x: 196 },
      { t: 330, x: 170 },
      { t: 360, x: 136 },
    ]
    expect(velocidadeRecente(amostras)).toBeCloseTo(-1, 1)
  })

  it('tem SENTIDO: o recuo rápido no fim é velocidade para o outro lado', () => {
    // Revisão de 11/10/2026: 100 px para a esquerda, parado, e um puxão de
    // volta de 50 px em 40 ms (o "desisti"). Sem sinal, isso era flick.
    const recuo = [
      { t: 0, x: 300 },
      { t: 200, x: 200 },
      { t: 295, x: 200 },
      { t: 335, x: 250 },
    ]
    expect(velocidadeRecente(recuo)).toBeGreaterThan(0.5)
    expect(velocidadeRecente([{ t: 0, x: 300 }, { t: 50, x: 250 }])).toBeLessThan(0)
  })

  it('sem duas amostras não há velocidade', () => {
    expect(velocidadeRecente([])).toBe(0)
    expect(velocidadeRecente([{ t: 0, x: 10 }])).toBe(0)
  })
})

describe('soltou: troca ou não troca', () => {
  it('64 px para a esquerda troca para a próxima', () => {
    expect(decideDeslize({ dx: -64, dy: 4, velocidade: 0 })).toBe('esquerda')
    expect(decideDeslize({ dx: 64, dy: -4, velocidade: 0 })).toBe('direita')
  })

  it('63 px devagar não troca', () => {
    expect(decideDeslize({ dx: 63, dy: 0, velocidade: 0.1 })).toBeNull()
  })

  it('40 px rápidos (>= 0,5 px/ms) trocam; 39 px rápidos não', () => {
    expect(decideDeslize({ dx: -45, dy: 3, velocidade: -0.8 })).toBe('esquerda')
    expect(decideDeslize({ dx: -39, dy: 0, velocidade: -2 })).toBeNull()
  })

  it('o flick só conta no MESMO sentido do deslize (o recuo de quem desistiu não troca)', () => {
    expect(decideDeslize({ dx: -50, dy: 0, velocidade: 0.8 })).toBeNull()
    expect(decideDeslize({ dx: -50, dy: 0, velocidade: -0.8 })).toBe('esquerda')
    // Longe (>= 64 px) troca pela distância, qualquer que seja o fim.
    expect(decideDeslize({ dx: -80, dy: 0, velocidade: 0.8 })).toBe('esquerda')
  })

  it('torto na soltura não troca, mesmo longe', () => {
    expect(decideDeslize({ dx: -100, dy: 60, velocidade: 1 })).toBeNull()
  })
})

describe('a borda é do Android (o gesto de voltar do sistema)', () => {
  it(`começar a menos de ${BORDA_PX} px de qualquer borda não conta`, () => {
    expect(comecaNaBorda(20, 412)).toBe(true)
    expect(comecaNaBorda(412 - 20, 412)).toBe(true)
    expect(comecaNaBorda(30, 412)).toBe(false)
    expect(comecaNaBorda(206, 412)).toBe(false)
  })
})

describe('a aba vizinha, sem dar a volta', () => {
  it('esquerda vai para a próxima; direita, para a anterior', () => {
    expect(proximaAba(2, 'esquerda', 6)).toBe(3)
    expect(proximaAba(2, 'direita', 6)).toBe(1)
  })

  it('a primeira e a última aba são as pontas: o gesto para ali', () => {
    expect(proximaAba(0, 'direita', 6)).toBeNull()
    expect(proximaAba(5, 'esquerda', 6)).toBeNull()
  })

  it('fora da barra (índice -1) nada troca', () => {
    expect(proximaAba(-1, 'esquerda', 6)).toBeNull()
  })
})
