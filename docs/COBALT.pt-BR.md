# YouTube e Instagram pelo Cobalt

O OPTDOWNS resolve vídeos e Shorts do YouTube e publicações do Instagram pelo **seu próprio** Worker e pela **sua própria** instância do [Cobalt](https://github.com/imputnet/cobalt). Sem os dois, o YouTube fica desligado, e o Instagram usa só a leitura pública anônima.

- [Como funciona](#como-funciona)
- [Variáveis do Worker](#variáveis-do-worker)
- [Rotas](#rotas)
- [YouTube](#youtube)
- [Instagram](#instagram)
- [Carga no Cobalt](#carga-no-cobalt)
- [Erros](#erros)
- [Sua instância do Cobalt](#sua-instância-do-cobalt)
- [Opções do userscript](#opções-do-userscript)
- [Limites](#limites)
- [Situação dos testes](#situação-dos-testes)
- [Uso responsável](#uso-responsável)

## Como funciona

```
userscript --/yt/info ou /ig/info--> Worker --oEmbed (título, miniatura)-------> YouTube
                                       |--Data API v3 (duração, opcional)-----> Google
                                       |--tags og: (prévia, Instagram)--------> Instagram
                                       '--POST por qualidade-----------------> SEU Cobalt
userscript --/yt/dl ou /ig/dl?t=...--> Worker --POST + stream do túnel--------> SEU Cobalt
```

- O Cobalt precisa de Node e ffmpeg, então não roda no Cloudflare Workers. Ele fica em um servidor seu, e o Worker é a ponte.
- O link de download é um **token cifrado** que carrega só parâmetros. Não é o túnel do Cobalt, que expira em cerca de 90 segundos, então o Cobalt é consultado de novo na hora de baixar. Um token de uma rota não vale em outra.
- Nenhuma chave de API fica no userscript.

## Variáveis do Worker

| Variável | Tipo | Obrigatória | Padrão | Uso |
| --- | --- | --- | --- | --- |
| `COBALT_API_URL` | variável | sim | nenhum | Raiz da API da sua instância (POST `/`), como `https://cobalt.exemplo.com/`. HTTPS na porta 443. Sem ela, YouTube e Instagram pelo Cobalt ficam desligados. |
| `COBALT_API_KEY` | secret | se a instância exigir | nenhum | Enviada como `Authorization: Api-Key ...`. É aparada e validada, nunca é exibida e nunca vai ao navegador. |
| `YOUTUBE_API_KEY` | secret | não | nenhum | YouTube Data API v3, usada só para a duração. |
| `TOKEN_KEY` ou `SECRET` | secret | sim | nenhum | Cifra os tokens de `/yt/dl` e `/ig/dl`. |
| `YT_QUALITIES` | variável | não | `2160:vp9,1440:vp9,1080,720,480,360,240` | Camadas testadas a cada busca. |
| `COBALT_CONCURRENCY` | variável | não | `2` | Máximo de chamadas simultâneas ao Cobalt. |
| `COBALT_GAP_MS` | variável | não | `150` | Intervalo mínimo entre inícios de chamada. |
| `COBALT_RETRIES` | variável | não | `2` | Novas tentativas em 429, 502, 503 e 504. |
| `COBALT_BACKOFF_MS` | variável | não | `700` | Espera base, dobrada a cada tentativa. |
| `COBALT_COOLDOWN_MS` | variável | não | `8000` | Pausa quando as tentativas acabam em 429. Dobra a cada esgotamento seguido até 30 segundos e zera no primeiro sucesso. |

Os padrões de `COBALT_*` foram escolhidos para esta versão e não foram calibrados em uma instância real.

```bash
npx wrangler secret put COBALT_API_KEY
npx wrangler secret put YOUTUBE_API_KEY
```

Depois de publicar, abra `https://SEU-WORKER/yt/status?key=SEU_SECRET`, ou use a aba de diagnóstico. Ele confere a configuração, a versão e os serviços da sua instância (inclusive se `youtube` e `instagram` estão ativos) e faz um POST de teste autenticado que não chega ao YouTube. Use `?auth=0` para pular o POST de teste.

## Rotas

| Rota | O que faz |
| --- | --- |
| `GET /yt/info?url=<youtube>` | Título, canal, miniatura, duração (com `YOUTUBE_API_KEY`) e as opções que o Cobalt confirmou. `&sizes=1` também pede os tamanhos. |
| `GET /yt/dl?t=<token>` | Entrega o arquivo escolhido. `&probe=1` resolve o item sem abrir o túnel e devolve JSON. |
| `GET /ig/info?url=<instagram>` | Itens de um Reel, post ou carrossel, com prévia quando disponível. |
| `GET /ig/dl?t=<token>` | Entrega um item. Aceita `&probe=1`. |
| `GET /yt/status` | Verificação da configuração mais uma requisição real à sua instância. |

`/yt/dl` e `/ig/dl` não repassam `Range`. O túnel do Cobalt não atende `Range`, então o Worker responde 200 com o arquivo completo e `Accept-Ranges: none`. Com `Content-Length` exato, qualquer corte vira erro de transferência em vez de um arquivo truncado. O `MAX_BYTES` é respeitado: um tamanho declarado acima dele devolve HTTP 413 `TOO_LARGE` antes de transferir.

## YouTube

- **Links:** `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` e `/live/`. Link de playlist sem ID de vídeo é recusado. Shorts, `youtu.be`, embed e live são convertidos para `https://www.youtube.com/watch?v=ID` antes de chegar ao Worker, e o selo Short é mantido.
- **Qualidades:** o Worker testa cada camada e lista só o que o Cobalt confirmou. Resolução e codec são lidos do nome de arquivo `classic` que o Cobalt devolve. Se o nome não traz a resolução, a opção aparece como "até Np" com um aviso, e a resolução nunca é inventada. Duplicatas somem, e VP9 em 1080p ou menos é descartado quando existe MP4.
- **Codecs:** até 1080p o Worker pede H.264 (MP4). Acima de 1080p pede VP9, entregue em **WebM**. Shorts usam o menor lado como qualidade, então 1080x1920 vale 1080p.
- **MP3:** uma opção própria, convertida pelo Cobalt, listada quando ao menos um vídeo foi extraído e confirmada no download.
- **WebM nunca é renomeado para MP4.** Se uma opção rotulada MP4 receber `video/webm` do túnel, a extensão é corrigida e o cabeçalho `x-optdowns-ext-corrected` é enviado.
- **Só áudio:** um pedido de vídeo que devolve apenas áudio é descartado na busca e recusado no download (`YT_AUDIO_ONLY`). Se o Cobalt responder `local-processing` ou `picker` para um pedido de vídeo, a opção é ignorada com um aviso.
- **Nada é inventado.** Sem `YOUTUBE_API_KEY` não há duração. O tamanho só aparece quando a fonte informa, e tamanho sem `Content-Length` exato aparece como estimado. Túneis com remux costumam não ter tamanho, então o progresso mostra os MB recebidos, sem total.
- **Nesta página:** a aba identifica o vídeo pela URL, espera 700 ms de URL estável, cancela a consulta anterior ao trocar de vídeo e descarta uma resposta cujo ID não corresponda ao vídeo aberto. Só roda com o painel aberto e a aba visível. URLs `blob:` e de MediaSource nunca são enviadas a lugar nenhum.

## Instagram

- **Fluxo:** `/ig/info` pede ao Cobalt `downloadMode: auto` e `videoQuality: max`, o que dá o arquivo original, sem recodificar. Reels, `/p/`, `/tv/`, `/reels/`, links de usuário e `/share/` são reconhecidos.
- **Carrosséis:** um card por item, numerado, com os vídeos antes das fotos e miniatura quando o Cobalt informa.
- **Metadados:** o Cobalt não informa título, duração nem resolução do Instagram, então esses campos ficam vazios. `og:image` e `og:title` públicos são buscados em paralelo, em melhor esforço, esperando até cerca de 1,5 segundo. Sem eles, o card mostra "Instagram · código".
- **Reserva:** se o Worker ou o Cobalt estiver indisponível (sem `COBALT_API_URL`, Worker antigo, rede), o script usa a leitura pública anônima e não mostra erro. Se ela também falhar, a mensagem descreve as duas tentativas. Erros sobre o conteúdo, como conta privada, não tentam a reserva.
- **Ordem:** `LINK_PROXY_INSTAGRAM_ORDER = 'cobalt-first'` é o padrão. `'local-first'` tenta primeiro a leitura pública leve, depois Worker e Cobalt só se ela não achar mídia, e o erro específico do Cobalt prevalece.
- **Sem suporte:** stories. **Sem mudança:** Instagram em **Nesta página**.

## Carga no Cobalt

O limite padrão de uma instância do Cobalt é de cerca de 20 POSTs por minuto por IP. Esta versão reduz o que o OPTDOWNS pede a ela:

- No máximo duas chamadas simultâneas, espaçadas por um intervalo mínimo e compartilhadas por todas as requisições do mesmo isolate.
- Novas tentativas com esperas crescentes em 429, 502, 503 e 504. O `Retry-After` é respeitado, e esperas acima de 6 segundos não são aguardadas.
- Quando as tentativas acabam, uma pausa global. As requisições durante a pausa falham rápido em vez de esperar.
- Sondagem adaptativa em ordem decrescente: uma camada é pulada quando um pedido maior já devolveu altura igual ou menor no mesmo codec. Se o Cobalt começar a limitar no meio da busca, o Worker para de pedir e devolve uma lista parcial com aviso (`partial: true`), que não vai para o cache.
- Cache de 20 segundos para falhas definitivas, então repetir a busca não chega ao Cobalt. YouTube: login ou idade exigidos, privado, indisponível, não encontrado, ao vivo, longo demais, não suportado, região. Instagram: privado, login, indisponível, sem mídia, não suportado.
- Um túnel por download. O túnel resolvido é reaproveitado por 45 segundos entre a pré-verificação, o HEAD e o download, e resolvido de novo se expirou.
- No userscript, itens do YouTube e do Instagram usam `credentials: 'omit'` e não baixam em blocos `Range`, já que cada bloco reabriria o remux inteiro.

Com todas as camadas, uma busca no YouTube ainda faz sete POSTs, o que dá mais ou menos duas buscas por minuto no limite padrão. Os resultados ficam em cache por 60 segundos no Worker e 45 segundos no userscript. Reduza `YT_QUALITIES` ou aumente o limite da sua instância para uso intenso.

## Erros

| Código | Significado |
| --- | --- |
| `YT_NOT_CONFIGURED` | Falta `COBALT_API_URL`. |
| `YT_NO_FORMATS` | Nenhum vídeo válido foi obtido. Os avisos dizem o motivo. |
| `YT_AUDIO_ONLY` | Um pedido de vídeo devolveu só áudio. |
| `YT_TOO_LONG` | O vídeo passa do que a sua instância permite. |
| `IG_PRIVATE`, `IG_LOGIN_REQUIRED`, `IG_UNAVAILABLE`, `IG_NO_MEDIA`, `IG_BLOCKED` | Casos específicos do Instagram: privado, login ou idade, removido, sem mídia, bloqueio do Instagram. |
| `COBALT_RATE_LIMIT` | HTTP 429 com o cabeçalho `Retry-After`. |
| `COBALT_UNAVAILABLE` | HTTP 503 com o cabeçalho `Retry-After`. |
| `COBALT_REDIRECT` | O Cobalt respondeu com 3xx. Ele não é seguido e a chave não é reenviada. |
| `COBALT_KEY_INVALID` | `COBALT_API_KEY` tem espaços ou caracteres inválidos. O valor nunca é exibido. |
| `ORIGIN_UNREACHABLE` | Falha de rede de verdade (502). |
| `WORKER_REQUEST_INVALID` | Falha local do runtime (500), separada dos erros de rede. |
| `TOO_LARGE` | O arquivo passa de `MAX_BYTES` (413). |
| `USE_YT_ROUTE` | O extrator genérico recusa links do YouTube. Use `/yt/info`. |

## Sua instância do Cobalt

Hospede a sua seguindo `docs/run-an-instance.md` e `docs/protect-an-instance.md` no repositório do Cobalt e crie uma chave de API para o Worker.

A documentação do Cobalt pede que instâncias hospedadas por terceiros não sejam usadas por outros projetos sem permissão. Por isso este repositório não embute nenhuma instância pública ou da comunidade.

O YouTube costuma exigir sessão ou cookies no servidor do Cobalt, e o mesmo pode valer para conteúdo do Instagram que exija login. Isso é configuração dele: o Worker não contorna login nem controles de acesso.

## Opções do userscript

| Constante | Efeito |
| --- | --- |
| `LINK_PROXY_YOUTUBE = false` | Desliga o YouTube. O script nunca envia links do YouTube ao Worker. |
| `LINK_PROXY_YOUTUBE_SIZES = true` | Pergunta ao Cobalt o tamanho de cada opção durante a busca. Mais requisições ao Cobalt. |
| `LINK_PROXY_INSTAGRAM = false` | Mantém o Instagram na leitura pública anônima. |
| `LINK_PROXY_INSTAGRAM_ORDER` | `'cobalt-first'` ou `'local-first'`. |

## Limites

- Sem playlists, transmissões ao vivo, stories do Instagram nem conteúdo que exija login.
- YouTube e Instagram mudam com frequência. Quando o Cobalt falha para eles, a mensagem do Worker diz o que atualizar.
- Acima de 1080p a saída é só WebM/VP9, sem MP4 nem AV1 e sem conversão. 2160p e 1440p dependem de a fonte publicá-las.
- O navegador monta o arquivo na memória antes de salvar. Arquivos de vários gigabytes e download com retomada não são tratados.
- O Cobalt é consumido só pela API HTTP e tem licença AGPL-3.0. Se você modificar e hospedar o Cobalt, a AGPL se aplica à sua instância.

## Situação dos testes

Todos os testes abaixo usaram Cobalt, YouTube e Instagram simulados. Nada foi validado contra os serviços reais, uma instância real do Cobalt, o runtime do Cloudflare Workers, o Tampermonkey ou o iOS. Leia "testado" como "testado com simulação". As suítes não fazem parte deste repositório.

| Suíte | Ambiente | Resultado |
| --- | --- | --- |
| Worker | Node, `fetch` simulado que emula as validações do runtime do Workers | 205 ok, 0 falhas |
| YouTube em Por link | Chromium, código real do Worker, Cobalt simulado | 33 ok, 0 falhas |
| YouTube em Nesta página | idem | 28 ok, 0 falhas |
| Regressões (`blob:` do player, validador de MP4, só áudio) | idem | 11 ok, 0 falhas |
| Instagram (Reel, carrossel, erros, reserva, `local-first`) | idem | 30 ok, 0 falhas |
| Carga e downloads (limites, resoluções, Shorts, 429, 503, truncamento) | idem | 15 ok, 0 falhas |

Não confirmado: a causa dos HTTP 503 intermitentes do Cobalt, a causa das falhas intermitentes em Shorts, os valores padrão de `COBALT_*` em uma instância real, e o formato exato do nome de arquivo `classic` e dos códigos de erro, que vêm da documentação e do código do Cobalt. Se uma versão mudar o nome, as opções aparecem como "até Np" com um aviso.

## Uso responsável

Baixar vídeos de terceiros pode violar os termos do YouTube e do Instagram e os direitos autorais do criador. Use para conteúdo seu ou licenciado. Para os seus próprios vídeos do YouTube, o YouTube Studio e o Google Takeout são opções melhores.
