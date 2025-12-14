# Especificação funcional BBRC/BCSB digital

## Objetivo
Implementar a Bateria Breve de Rastreio Cognitivo (BBRC/BCSB) com aplicação padronizada, captura de áudio/ASR obrigatória e exportação estruturada para uso clínico e pesquisa.

## Fluxo experimental
1. **Verificação pré-teste**: checagem de microfone, ambiente silencioso e consentimento para gravação.
2. **Nomeação (10 figuras)**: prancha `bbrc1.png` visível, paciente nomeia; aplicador confirma correções verbais.
3. **Memória incidental**: prancha oculta, evocação livre por voz.
4. **Memória imediata**: 30 s de exposição controlada + evocação livre.
5. **Aprendizado**: nova exposição de 30 s + evocação livre; registra início do temporizador de 5 min para a tardia.
6. **Fluência verbal (animais)**: 60 s de listagem livre com VAD/ASR aberto, deduplicação automática.
7. **Desenho do relógio**: canvas interativo; aplicador atribui escore Shulman (0–5) ou usa análise assistiva.
8. **Memória tardia**: evocação livre após ≥5 minutos de intervalo obrigatório (bloqueio automático até cumprir o tempo).
9. **Reconhecimento**: prancha `bbrc2.png` (20 figuras) apenas para referência visual; respostas exclusivamente verbais com vocabulário restrito de alvos + distratores.
10. **Pós-teste**: registro de interrupções e gravação de ambiente; geração de relatório estruturado (JSON/CSV/PDF).

## Lógica de captura e ASR
- **Sem digitação manual**: toda resposta do paciente é voz; aplicador apenas valida classificações.
- **Dupla estratégia**: transcrição livre + vocabulário controlado para as 20 figuras (targets + distratores). Sinônimos tolerados (p. ex., "aviao"→"avião").
- **Registro por enunciado** (`SpokenToken`): texto bruto, normalizado, classificação (`target|distractor|intrusion|repeat`), id mapeado, timestamp e confiança.
- **Memória/Reconhecimento**: mapeamento automático para os 10 alvos, intrusões listadas, ordem preservada pelo timestamp; repetições não pontuam.
- **Fluência**: vocabulário aberto validado contra dicionário de animais; repetições marcadas, inválidos registrados.
- **Baixa confiança**: ao receber transcrição vazia ou inconclusiva, o aplicador deve solicitar repetição verbal (mensagem automática).

## Modelo de dados (saída por sessão)
```json
{
  "sessionId": "uuid",
  "patientId": "uuid",
  "mode": "visual|auditivo",
  "environment": {"device": "Desktop", "startTime": "ISO", "isQuiet": true, "hadInterruptions": false},
  "asr": {"language": "pt-BR", "models": ["webkitSpeechRecognition"], "confidenceThreshold": 0.5},
  "stages": {
    "naming": {"tokens": [SpokenToken], "score": 0-10},
    "incidentalMemory": {"tokens": [SpokenToken], "score": 0-10},
    "immediateMemory": {"tokens": [SpokenToken], "score": 0-10, "studySeconds": 30},
    "learning": {"tokens": [SpokenToken], "score": 0-10, "studySeconds": 30, "delayStart": "ISO"},
    "verbalFluency": {"tokens": [SpokenToken], "valid": ["gato", ...], "score": 0+},
    "clock": {"image": "data:image/png;base64,...", "shulman": 0-5},
    "delayedMemory": {"tokens": [SpokenToken], "score": 0-10, "waitedMs": 300000},
    "recognition": {"tokens": [SpokenToken], "hits": ["sapato"], "distractors": ["caminhão"], "score": 0-10}
  },
  "exports": {"json": "path", "csv": "path", "pdf": "path"}
}
```

## Máquina de estados
- `DASHBOARD → REGISTRATION → PRE_TEST_CHECK → NAMING → INCIDENTAL_MEMORY → IMMEDIATE_MEMORY → LEARNING → VERBAL_FLUENCY → CLOCK_DRAWING → DELAYED_MEMORY (bloqueado até 5 min) → RECOGNITION → POST_TEST_CHECK → RESULTS`.
- Transições condicionais: bloqueio se a verificação de microfone falhar, se 30 s de exposição forem interrompidos sem justificativa ou se a memória tardia for iniciada antes do tempo mínimo.

## Pontuação e validações
- **Memórias**: escore = nº de alvos únicos (0–10). Intrusões e repetições registradas, não pontuadas.
- **Fluência**: escore = nº de animais únicos válidos em 60 s. Repetições e não-animais registrados.
- **Relógio**: escore Shulman (0–5) com opção de apoio automático via `analyzeClockDrawing`.
- **Reconhecimento**: escore = nº de alvos nomeados (0–10); distratores mencionados contabilizados como intrusão.

## Componentes de referência
- `ASRService/VoiceRecorder`: microfone contínuo com VAD simples, reinício automático e transcrição parcial.
- `StimulusGrid`: renderiza prancha de 10 ou 20 figuras (somente visualização, sem interação).
- `RecallVoiceCollector` / `RecognitionVoiceCollector`: integra ASR com `scoreRecallUtterance` e `scoreRecognitionUtterance`, exibe intrusões e repetições.
- `FluencyVoiceTimer`: cronômetro de 60 s, bloqueia adição após término.
- `ClockCanvas`: desenho livre com salvamento em PNG.
- `ExportService`: gera JSON/CSV; PDF com gráfico de curva de aprendizagem e imagem do relógio (stub).

## Pseudo-código de referência
```ts
onSpeech(transcript) {
  switch(stage) {
    case 'naming':
    case 'incidentalMemory':
    case 'immediateMemory':
    case 'learning':
    case 'delayedMemory':
      const recall = scoreRecallUtterance(transcript, state.currentHits)
      state.currentHits.add(recall.hits)
      logTokens(recall.tokens)
      scores[stage] = state.currentHits.size
      break
    case 'verbalFluency':
      const flu = scoreFluencyUtterance(transcript, ANIMAL_LIST, state.fluency.valid)
      state.fluency.valid.add(flu.animals)
      logTokens(flu.tokens)
      scores.verbalFluency = state.fluency.valid.size
      break
    case 'recognition':
      const rec = scoreRecognitionUtterance(transcript, state.recognition.hits)
      state.recognition.hits.add(rec.hits)
      logTokens(rec.tokens)
      scores.recognition = state.recognition.hits.size
      break
  }
}
```

## Testes automatizados
- Deduplicação de alvos e identificação de intrusões/repetições (memória e reconhecimento).
- Validação da contagem de animais válidos na fluência com exclusão de repetições.
- Temporizadores: bloqueio de memória tardia antes de 5 minutos; estudo de 30 s executado sem interação manual.
- Robustez de ASR: tolera sinônimos e variações ortográficas simples, normalizando para pontuação coerente.
