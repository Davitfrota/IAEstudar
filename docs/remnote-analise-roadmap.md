# RemNote — Análise Competitiva e Roadmap de Ideias

## Correção importante em relação ao que eu tinha assumido

Na conversa anterior eu comparei o editor com "estilo Notion". Não é bem isso — o RemNote é um
**outliner** (mesma família do Roam Research, Workflowy, Logseq), não um editor de blocos.
Estrutura é feita por indentação (Tab/Shift+Tab), e qualquer bullet ("Rem") pode virar flashcard
com uma sintaxe leve: `==frente==verso`, `>>` (só frente→verso), `<<` (reverso), `{{cloze}}`.
Cards com múltiplas linhas nascem da própria hierarquia — se o pai termina com o símbolo de
flashcard, os filhos viram automaticamente o verso. Isso não muda a recomendação do BlockNote
(seu produto pode continuar sendo blocos), mas muda o que vale copiar: o diferencial real do
RemNote não é o editor, é o que ele faz *em cima* da estrutura.

## O que vale estudar

### Portals (transclusão)
O mesmo conteúdo aparece e é editável em múltiplos lugares ao mesmo tempo, sincronizado nos
dois sentidos — como abrir uma janela pra outro documento. Resolve um problema real: você
anota um conceito na fonte onde aprendeu (aula X), mas quer ele também centralizado num
documento por tema. Com portal, edita em qualquer um dos dois lugares e o outro atualiza
sozinho.

### Backlinks + referências automáticas
Link é sempre bidirecional — linkar A→B cria B→A de graça. Existe ainda "referência de texto":
se o nome de um Rem aparece em qualquer lugar do sistema, mesmo sem link explícito, ele
aparece na seção de referências daquele Rem. E "search portals": uma busca salva que
funciona como pasta viva, sempre atualizada.

### IA aplicada à geração de conteúdo
- Configuração de geração mostra **nível de detalhe** (resumo / pontos importantes / cobertura
  exaustiva) já com contagem estimada de cards e custo em créditos **antes** de gerar —
  transparência que evita surpresa
- Seletor de qual trecho do documento usar (não precisa gerar do documento inteiro sempre)
- Seletor de modelo (grande vs. pequeno) atrelado ao custo
- Todo card gerado já vem com explicação, mnemônico e "near misses" (distratores plausíveis)
  anexados — vai além de pergunta/resposta crua
- Aceita múltiplas fontes: PDF, página web, texto colado, transcrição de aula, imagem→texto
- Preview de cada card antes de aceitar, editável campo a campo

### AI Tutor contextual
Chat embutido que aparece **durante a prática** — vê o card que você está revisando naquele
momento, explica o termo confuso, e pode gerar um novo card a partir da própria resposta dele.
Não é um chat genérico ao lado; é ciente do contexto exato da revisão.

### Agendamento
Suporta dois algoritmos (SM-2 clássico e FSRS) e ajusta o agendamento perto de uma data de
prova — comprime os intervalos de revisão pra garantir cobertura antes do prazo, em vez de
manter o espaçamento linear padrão.

### Modelo de negócio
- Trial por uso, não por tempo: cada feature Pro pode ser usada um número limitado de vezes no
  plano free, sem prazo de expiração — reduz a ansiedade de "vou perder o trial antes de
  decidir"
- Free generoso mas com teto (3 anotações de PDF, 5 cards de oclusão de imagem); Pro na faixa
  de US$ 6–10/mês; opção de compra única (~US$ 300) pra acesso vitalício
- Import/export rico: Markdown, Roam, Workflowy, Dynalist, Anki — reduz fricção pra quem já
  tem conteúdo em outro lugar
- Fraqueza conhecida e citada em várias reviews: curva de aprendizado alta — a sintaxe própria
  (`==`, `>>`, `{{}}`) leva cerca de uma semana pra internalizar

## Roadmap priorizado

**Curto prazo — encaixa ainda na Fase 2 (UX do agente/prática):**
- Mostrar estimativa de cards + custo antes de rodar `generate_form` (já dá pra encaixar no
  preview do tool call que a Fase 1 deixou reservado)
- Preview editável campo a campo de cada pergunta gerada, não só aceitar/rejeitar o lote inteiro

**Médio prazo — Fase 3:**
- AI Tutor contextual dentro do `PracticeQueue` (depende da tela de prática da Fase 2 já existir)
- Backlinks/portais entre `documents` — tecnicamente vira mais grafo de conhecimento que árvore
  de pastas pura; maior mudança de schema, por isso não entra antes
- Compressão de agenda perto do `target_date` (o schema já suporta, falta a lógica)
- Otimização de parâmetros do FSRS por usuário via `@open-spaced-repetition/binding`, treinando
  com o histórico acumulado em `form_reviews` — só faz sentido com uso real acumulado

**Longo prazo:**
- Import de Markdown/Anki (adoção facilitada pra quem já estuda com outra ferramenta)
- Modo offline com indicador de sync
- Tipos de card mais avançados (oclusão de imagem, por exemplo, bom pra quem estuda anatomia,
  circuitos, mapas)

## Onde o seu projeto já sai na frente

- O RemNote sempre parte de você já ter escrito a nota — a IA ajuda a transformar o que já
  existe. O seu agente parte de "preciso estudar X até tal data" e constrói pasta, documento,
  cronograma e formulário sozinho. É uma proposta mais ambiciosa de autonomia.
- RemNote tem curva de aprendizado alta por causa da sintaxe própria. Com BlockNote (edição
  familiar) + agente cuidando da estruturação, a fricção de entrada tende a ser bem menor.

## Fontes

- [remnote.com](https://www.remnote.com/) · [remnote.com/feature/ai-flashcards](https://www.remnote.com/feature/ai-flashcards) · [remnote.com/pricing](https://www.remnote.com/pricing)
- [help.remnote.com — Portals](https://help.remnote.com/en/articles/6030742-portals) · [Backlinks](https://help.remnote.com/en/articles/6030776-backlinks) · [Geração de flashcards com IA](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai)
- [toolguide.io — review RemNote 2026](https://toolguide.io/en/tool/remnote/)
