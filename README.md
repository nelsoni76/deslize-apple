# deslize-apple

O deslize do iPhone para apps web: o elástico das pontas, a mola ao soltar e a
régua que decide se o dedo foi de lado ou rolou a lista.

São funções puras, sem dependências e sem DOM. Quem anima pede os números e
entrega ao `element.animate`.

## As três peças da Apple

| Peça | De onde vem | Números |
|---|---|---|
| Elástico nas pontas | `UIScrollView` | `(1 − 1/(x·c/d + 1))·d`, c = 0,55 |
| Mola ao soltar | `.smooth` do iOS 17, WWDC23 "Animate with springs" | 0,5 s, sem quique |
| Velocidade do dedo | WWDC18 "Designing Fluid Interfaces" | entra como velocidade inicial da mola |

A Apple não publica o algoritmo do elástico.
O 0,55 é a aproximação empírica de Ole Begemann (2014), a mesma que o Flutter usa.

## A régua do gesto

- O gesto se decide uma vez, depois de 8 px.
- É de lado quando |dx| é pelo menos o dobro de |dy|, ou seja, ângulo menor que ~27°.
- Troca com 64 px, ou com 40 px num flick de 0,5 px/ms medido nos últimos 100 ms.
- As faixas de 28 px nas bordas ficam com o gesto de voltar do Android.

## Instalar

O pacote sai como arquivo da release, sem npm e sem git na hora do build:

```bash
npm install https://github.com/nelsoni76/deslize-apple/releases/download/v1.0.0/deslize-apple-1.0.0.tgz
```

## Usar

```ts
import {
  classificaDeslize,
  decideDeslize,
  velocidadeRecente,
  elastico,
  limitaVelocidade,
  quadrosDaMola,
  quadrosDeTransform,
  DURACAO_DOS_QUADROS,
  MOLA_SUAVE,
  translacao,
} from 'deslize-apple'

// Durante o arrasto, além da ponta:
el.style.transform = translacao(elastico(dx, largura))

// Ao soltar: velocidade do dedo em px/ms, a mola quer px/s.
const v = limitaVelocidade(velocidadeRecente(amostras) * 1000, alvo - x, MOLA_SUAVE)
const xs = quadrosDaMola(x, alvo, v)
el.style.transform = translacao(alvo)
el.animate(quadrosDeTransform(xs), {
  duration: DURACAO_DOS_QUADROS(xs.length),
  easing: 'linear',
})
```

O último quadro é sempre o alvo exato.
Escreva o alvo inline antes de animar, e o fim da animação não pula nem meio pixel.

Com "Reduzir movimento" ligado no sistema, corte seco: não chame a mola.

## API

**Mola** (`mola.ts`)

- `elastico(dx, largura, c?)`: quanto a tela anda com o dedo `dx` além da ponta.
- `dedoDoElastico(y, largura, c?)`: a inversa, para pegar uma mola de volta na ponta sem salto.
- `derivadaDoElastico(x, largura, c?)`: px de tela por px de dedo no elástico.
- `molaDeDuracao(duracao?, quique?)` e `MOLA_SUAVE`: a mola do SwiftUI pela duração.
- `quadrosDaMola(de, ate, v0, mola?)`: as posições a 120 Hz até assentar.
- `limitaVelocidade(v0, restante, mola)`: a maior velocidade que não passa do alvo.
- `translacao(x)`, `quadrosDeTransform(xs)`, `DURACAO_DOS_QUADROS(n)`: o formato do `transform` e a duração.

**Gesto** (`gesto.ts`)

- `classificaDeslize(dx, dy)`: `indefinido`, `horizontal` ou `vertical`.
- `velocidadeRecente(amostras, janela?)`: px/ms com sinal, só na janela recente.
- `decideDeslize({ dx, dy, velocidade })`: `esquerda`, `direita` ou `null`.
- `comecaNaBorda(x, largura, borda?)`: o toque nasceu na faixa do voltar do sistema?
- `proximaAba(indice, direcao, total)`: o índice de destino, sem dar a volta nas pontas.

## Licença

MIT
