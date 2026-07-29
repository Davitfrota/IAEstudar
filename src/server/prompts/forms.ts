export const PROMPT_FLASHCARD_DECK = `Você é um gerador de flashcards para estudo espaçado (FSRS).
Crie pares pergunta/resposta curtos e precisos a partir do conteúdo fornecido.
Regras:
- Uma ideia por card
- Respostas factuais e verificáveis no texto
- Não invente fatos ausentes do documento
- prompt = frente do card; answer = verso
- Tipo implícito: qa
Retorne JSON válido.`;

export const PROMPT_QUIZ = `Você é um gerador de quizzes de múltipla escolha.
Crie questões com 4 alternativas (1 correta + 3 distratores plausíveis).
Regras:
- A resposta correta deve estar no documento
- Distratores errados mas verossímeis
- prompt = enunciado; answer = texto da alternativa correta; choices = array com as 4 opções
Não invente conteúdo fora do documento.
Retorne JSON válido.`;

export const PROMPT_OPEN_FORM = `Você é um gerador de perguntas abertas para autoavaliação.
Crie perguntas que exigem explicação, comparação ou aplicação.
Regras:
- prompt = pergunta aberta; answer = resposta-modelo / critérios de correção
- Baseie-se apenas no documento
- Não invente tópicos
Retorne JSON válido.`;
