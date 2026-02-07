import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';
export const isGeminiConfigured = Boolean(apiKey);
const ai = new GoogleGenAI({ apiKey });

export interface ClockAnalysisResult {
  score: number;
  reasoning: string;
}

/**
 * Analisa o desenho do relógio usando IA (Gemini) com os critérios de Shulman (0-5).
 *
 * Critérios de Shulman conforme BBRC (Nitrini et al.):
 * 5 - Desenho do relógio perfeito
 * 4 - Mínimo erro visuoespacial
 * 3 - Representação inadequada do horário 11:10, sem grande alteração visuoespacial
 * 2 - Erro visuoespacial moderado, impossibilitando a indicação dos ponteiros
 * 1 - Desenhos de relógio com grande desorganização visuoespacial
 * 0 - Incapacidade para representar qualquer imagem que lembre um relógio
 */
export async function analyzeClockDrawing(imageBase64: string): Promise<ClockAnalysisResult> {
  if (!apiKey) {
    console.warn("Gemini API Key missing. Returning mock score.");
    return { score: 3, reasoning: "Chave de API não configurada. Pontuação padrão." };
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");

    const prompt = `Você é um neuropsicólogo especialista em avaliação cognitiva. Analise este desenho do Teste do Desenho do Relógio (TDR), parte da Bateria Breve de Rastreio Cognitivo (BBRC).

Instrução dada ao paciente: "Desenhe um círculo grande, como o mostrador de um relógio. Coloque todos os números. Depois, coloque os ponteiros marcando 11 horas e 10 minutos."

Avalie ESTRITAMENTE de acordo com os critérios de Shulman (escala de 0 a 5 pontos):

5 pontos – Desenho do relógio PERFEITO: círculo bem formado, todos os 12 números presentes na posição correta e bem distribuídos, dois ponteiros distintos (hora e minuto) apontando corretamente para o horário 11:10 (ponteiro curto no 11, ponteiro longo no 2).

4 pontos – Mínimo erro visuoespacial: pequenos problemas de espaçamento entre os números ou leve desalinhamento, mas o horário 11:10 é claramente representado com dois ponteiros distinguíveis.

3 pontos – Representação INADEQUADA do horário 11:10 (ponteiros errados, apontando para números errados, ou apenas um ponteiro), porém sem grande alteração visuoespacial na organização dos números no mostrador.

2 pontos – Erro visuoespacial MODERADO: números concentrados em um hemisfério, fora de sequência, ou fora do círculo, impossibilitando a correta indicação dos ponteiros. Organização espacial comprometida.

1 ponto – Grande DESORGANIZAÇÃO visuoespacial: números em posições completamente aleatórias, faltando números, perseveração, ponteiros ausentes ou sem qualquer lógica.

0 pontos – Incapacidade para representar qualquer imagem que lembre um relógio (rabiscos, página em branco, tentativa não reconhecível).

IMPORTANTE: Ao avaliar, considere:
- Presença e posição dos 12 números (1-12)
- Formato circular do mostrador
- Presença de dois ponteiros distinguíveis
- Correta indicação do horário 11:10
- Distribuição espacial dos elementos

Retorne a pontuação (0-5) e uma breve justificativa em português.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/png", data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: {
              type: Type.INTEGER,
              description: "Pontuação Shulman de 0 a 5"
            },
            reasoning: {
              type: Type.STRING,
              description: "Justificativa breve da pontuação em português"
            },
            numbersPresent: {
              type: Type.STRING,
              description: "Quais números estão presentes no desenho"
            },
            handsCorrect: {
              type: Type.BOOLEAN,
              description: "Se os ponteiros indicam corretamente 11:10"
            },
            spatialOrganization: {
              type: Type.STRING,
              description: "Qualidade da organização espacial: boa, moderada, ruim"
            }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    const score = Math.max(0, Math.min(5, result.score ?? 0));
    const reasoning = result.reasoning || "";

    return { score, reasoning };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return { score: 0, reasoning: "Erro na análise automática. Atribua a pontuação manualmente." };
  }
}
