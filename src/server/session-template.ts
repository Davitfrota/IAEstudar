/** Sessão = página de livro com conteúdo real de estudo. */

export type SessionTemplateInput = {
  courseName: string;
  topic: string;
  sessionNumber: number;
  sessionsInTopic: number;
  dateIso: string;
  dailyMinutes: number;
  focusPoints: string[];
  /** Texto da Nara — só entra se for substancial. */
  studyBody?: string;
  searchQuery: string;
};

type Figure = { url: string; caption: string };
type Media = { label: string; url: string };

const MIN_USEFUL_BODY = 280;

function pickFigures(topic: string): Figure[] {
  const t = topic.toLowerCase();
  if (/organela|mitocond|riboss|lisoss|golgi|ret[ií]culo|n[uú]cleo/.test(t)) {
    return [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Animal_cell_structure_en.svg/960px-Animal_cell_structure_en.svg.png",
        caption: "Célula animal — organelas principais",
      },
    ];
  }
  if (/membrana|fosfolip|bicamada|fluidez/.test(t)) {
    return [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Cell_membrane_detailed_diagram_en.svg/960px-Cell_membrane_detailed_diagram_en.svg.png",
        caption: "Membrana plasmática — modelo do mosaico fluido",
      },
    ];
  }
  if (/transporte|difus|osmose|bomba|s[oó]dio|pot[aá]ssio|ativo|passivo/.test(t)) {
    return [
      {
        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Scheme_facilitated_diffusion_in_cell_membrane-en.svg/960px-Scheme_facilitated_diffusion_in_cell_membrane-en.svg.png",
        caption: "Transporte através da membrana",
      },
    ];
  }
  return [
    {
      url: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=960&q=80",
      caption: `Figura de apoio — ${topic}`,
    },
  ];
}

function pickMedia(topic: string, course: string, searchQuery: string): Media[] {
  const q = encodeURIComponent(searchQuery);
  const t = encodeURIComponent(`${topic} ${course}`);
  return [
    {
      label: `YouTube — ${topic} (aulas curtas)`,
      url: `https://www.youtube.com/results?search_query=${q}+aula+resumo`,
    },
    {
      label: `Khan Academy — buscar ${topic}`,
      url: `https://www.khanacademy.org/search?page_search_query=${t}`,
    },
    {
      label: `YouTube — animação / diagrama`,
      url: `https://www.youtube.com/results?search_query=${q}+animação+diagrama`,
    },
  ];
}

/** Conteúdo didático embutido (não depende do LLM). */
function textbookForTopic(topic: string, sessionNumber: number): string {
  const t = topic.toLowerCase();

  if (/organela|mitocond|riboss|n[uú]cleo|golgi|lisoss/.test(t)) {
    const parts = [
      `As **organelas** são compartimentos (ou estruturas) da célula com funções específicas. Pense na célula como uma cidade: cada órgão municipal tem um papel.`,
      ``,
      `### Núcleo`,
      `Guarda o DNA e controla a expressão gênica. A membrana nuclear tem poros que regulam a entrada/saída de moléculas (ex.: mRNA). Sem núcleo íntegro, a célula eucariótica perde o “arquivo mestre”.`,
      ``,
      `### Mitocôndria`,
      `Produz ATP pela respiração celular. Tem membrana dupla e matriz interna. Células com alto gasto energético (músculo, neurônio) tendem a ter muitas mitocôndrias.`,
      ``,
      `### Ribossomos`,
      `Síntese de proteínas a partir do mRNA. Podem estar livres no citosol ou ligados ao retículo endoplasmático rugoso (proteínas para secreção/membrana).`,
      ``,
      `### Retículo e Golgi (visão rápida)`,
      `- **RE rugoso:** processamento de proteínas.`,
      `- **RE liso:** lipídios, detox (em alguns tecidos).`,
      `- **Golgi:** empacota e endereça vesículas.`,
      ``,
      `### Armadilhas comuns`,
      `- Confundir ribossomo (síntese) com mitocôndria (energia).`,
      `- Achar que “todas as organelas têm membrana” — ribossomos não.`,
      `- Esquecer que procariotos não têm núcleo verdadeiro.`,
    ];
    if (sessionNumber >= 2) {
      parts.push(
        ``,
        `### Nesta sessão (aprofundamento)`,
        `Relacione cada organela a **uma frase de função** e a **um exemplo de tecido** onde ela é crítica. Isso é o que cai em prova.`,
      );
    }
    return parts.join("\n");
  }

  if (/membrana|fosfolip|bicamada/.test(t)) {
    return [
      `A **membrana plasmática** separa o meio interno do externo e controla o tráfego de substâncias.`,
      ``,
      `### Modelo do mosaico fluido`,
      `Bicamada de **fosfolipídios** (cabeças hidrofílicas para fora, caudas hidrofóbicas para dentro) + **proteínas** embutidas ou periféricas + **colesterol** (em eucariotos animais) modulando fluidez.`,
      ``,
      `### Funções-chave`,
      `- Barreira seletiva`,
      `- Reconhecimento (glicoproteínas/glicolipídios)`,
      `- Ancoragem e sinalização`,
      `- Comunicação célula-célula`,
      ``,
      `### O que memorizar para prova`,
      `Polaridade dos fosfolipídios, papel do colesterol, diferença entre proteína integral e periférica, e por que moléculas pequenas/apolares atravessam mais fácil.`,
      ``,
      `### Erros comuns`,
      `- Achar que a membrana é “parede rígida” (em células animais não é).`,
      `- Confundir parede celular (plantas/fungos/bactérias) com membrana plasmática.`,
    ].join("\n");
  }

  if (/transporte|difus|osmose|ativo|passivo|bomba/.test(t)) {
    return [
      `**Transporte celular** explica como substâncias entram e saem sem a célula “explodir” ou esvaziar.`,
      ``,
      `### Passivo (sem ATP direto)`,
      `- **Difusão simples:** O₂, CO₂, lipídios pequenos.`,
      `- **Difusão facilitada:** canais/carregadores (ex.: glicose via GLUT).`,
      `- **Osmose:** água a favor do gradiente de potencial hídrico.`,
      ``,
      `### Ativo (gasta energia)`,
      `- **Bomba Na⁺/K⁺:** 3 Na⁺ para fora, 2 K⁺ para dentro (mantém potencial de membrana).`,
      `- Transporte ativo secundário (usa o gradiente criado pela bomba).`,
      ``,
      `### Como estudar`,
      `Para cada mecanismo, responda: precisa de proteína? precisa de ATP? a favor ou contra o gradiente?`,
      ``,
      `### Erros comuns`,
      `- Chamar toda entrada de “bomba”.`,
      `- Esquecer que osmose é um caso especial de difusão da água.`,
    ].join("\n");
  }

  // Genérico por tema (não força biologia)
  return [
    `Este bloco trata de **${topic}** com estudo ativo: leia, explique em voz alta e só então pratique.`,
    ``,
    `### Ideia central`,
    `Entenda ${topic} em três camadas:`,
    `1. **Definição** em uma frase clara.`,
    `2. **Mecanismo / estrutura / procedimento** — o “como funciona”.`,
    `3. **Exemplo aplicado** (prova, cotidiano ou exercício).`,
    ``,
    `### Roteiro desta sessão`,
    `1. Escreva a definição de ${topic} sem consultar o material.`,
    `2. Liste 3 subpontos que sustentam a ideia central.`,
    `3. Resolva mentalmente 1 problema típico do tema.`,
    `4. Anote 1 dúvida residual antes do quiz.`,
    ``,
    `### Mapa do tópico`,
    `- Conceito-núcleo de ${topic}`,
    `- Duas relações com outros tópicos do curso`,
    `- Um erro clássico de prova`,
    `- Um exemplo concreto`,
    ``,
    `### Fechamento`,
    `Se você não consegue ensinar ${topic} em 60 segundos, releia o mecanismo antes do formulário.`,
  ].join("\n");
}

function mergeStudyBody(topic: string, sessionNumber: number, aiBody?: string): string {
  const base = textbookForTopic(topic, sessionNumber);
  const ai = aiBody?.trim() ?? "";
  // Conteúdo longo da Nara vira o corpo principal (evita forçar biologia em qualquer tema)
  if (ai.length >= MIN_USEFUL_BODY) {
    const isBioTopic =
      /organela|membrana|transporte|c[eé]lula|mitocond|osmose|fosfolip/.test(
        topic.toLowerCase(),
      );
    if (isBioTopic) {
      return `${base}\n\n### Complemento da Nara\n\n${ai}`;
    }
    return [
      `### Explicação`,
      ``,
      ai,
      ``,
      `### Como estudar`,
      `1. Resuma ${topic} em 3 frases suas.`,
      `2. Escreva 1 exemplo aplicado.`,
      `3. Liste 1 erro clássico de prova.`,
      `4. Só então abra o formulário do dia.`,
    ].join("\n");
  }
  if (ai.length >= 40) {
    return `${base}\n\n### Nota rápida\n\n${ai}`;
  }
  return base;
}

export function buildDailySessionContent(input: SessionTemplateInput): string {
  const figures = pickFigures(input.topic);
  const media = pickMedia(input.topic, input.courseName, input.searchQuery);
  const body = mergeStudyBody(
    input.topic,
    input.sessionNumber,
    input.studyBody,
  );

  const figureMd = figures
    .map(
      (f) =>
        `![${f.caption}](${f.url})\n\n*${f.caption}*\n\n[Abrir figura ampliada](${f.url})`,
    )
    .join("\n\n");

  const mediaMd = media.map((m) => `- [${m.label}](${m.url})`).join("\n");

  return [
    `# ${input.topic}`,
    ``,
    `Sessão ${input.sessionNumber} de ${input.sessionsInTopic} · ${input.courseName} · ${input.dateIso} · ~${input.dailyMinutes} min`,
    ``,
    `## Leitura`,
    ``,
    body,
    ``,
    `## Figura`,
    ``,
    figureMd,
    ``,
    `## Para assistir / aprofundar`,
    ``,
    mediaMd,
    ``,
    `## Prática`,
    ``,
    `1. Releia a figura e diga em voz alta a função de 3 estruturas.`,
    `2. Faça o **formulário do dia** (quiz desta sessão).`,
    `3. Complete as anotações abaixo com frases suas (não copie o texto).`,
    ``,
    `## Anotações`,
    ``,
    `**Entendi:**`,
    ``,
    `- `,
    ``,
    `**Ainda confunde:**`,
    ``,
    `- `,
    ``,
    `**Levo para amanhã:**`,
    ``,
    `- `,
  ].join("\n");
}

export function buildCourseSummaryContent(input: {
  courseName: string;
  topics: string[];
  overview: string;
  targetDate?: string;
  dailyMinutes: number;
}): string {
  const overview = input.overview.trim();
  const richOverview =
    overview.length >= MIN_USEFUL_BODY
      ? overview
      : [
          overview.length > 20 ? overview : `Curso de **${input.courseName}**.`,
          ``,
          `Este resumo junta o essencial de todos os tópicos para revisão rápida e para alimentar flashcards. Use-o no começo de cada semana e na véspera da prova.`,
        ].join("\n");

  const topicSections = input.topics
    .map((topic, i) => {
      const body = textbookForTopic(topic, 1)
        .split("\n")
        .slice(0, 18)
        .join("\n");
      return `### ${i + 1}. ${topic}\n\n${body}`;
    })
    .join("\n\n");

  const list = input.topics.map((t) => `- ${t}`).join("\n");

  return [
    `# ${input.courseName}`,
    ``,
    `## Visão geral`,
    ``,
    richOverview,
    ``,
    `## Rota do curso`,
    ``,
    list || "- (definir com a Nara)",
    ``,
    input.targetDate
      ? `Meta: **${input.targetDate}** · ~${input.dailyMinutes} min/dia`
      : `Ritmo sugerido: ~${input.dailyMinutes} min/dia`,
    ``,
    `## Resumo por tópico`,
    ``,
    topicSections || "_Sem tópicos ainda._",
    ``,
    `## Como estudar aqui`,
    ``,
    `1. Leia este resumo (15–20 min).`,
    `2. Abra a sessão do dia na pasta do tópico.`,
    `3. Assista 1 vídeo curto da seção “Para assistir”.`,
    `4. Faça o formulário do dia.`,
    `5. Anote 3 frases com suas palavras.`,
  ].join("\n");
}
