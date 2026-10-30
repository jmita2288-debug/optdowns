# Suporte ao YouTube

O OPTDOWNS lista e baixa vídeos e Shorts do YouTube, com uma condição: tudo passa pelo **seu próprio** Worker e pela **sua própria** instância do [Cobalt](https://github.com/imputnet/cobalt). Sem os dois, nada do YouTube funciona.

## Como funciona

```
userscript --/yt/info--> Worker --oEmbed (título, miniatura)----------> YouTube (oficial)
                           |--Data API v3 (duração, opcional)--------> Google (oficial)
                           '--um POST por qualidade-----------------> SUA instância Cobalt
userscript --/yt/dl?t=...--> Worker --POST + stream do túnel---------> SUA instância Cobalt
```

- O Cobalt **não roda no Cloudflare Workers**, porque precisa de Node e ffmpeg. Ele fica em um servidor seu, e o Worker é só a ponte.
- O Worker testa cada qualidade no Cobalt e lista só as **confirmadas**. Resolução e codec são lidos do nome do arquivo que o Cobalt devolve, duplicatas somem e Shorts verticais usam o menor lado (1080x1920 conta como 1080p).
- O link de download é um **token cifrado** com os parâmetros. Não é o túnel do Cobalt, que expira em cerca de 90 segundos, então o Cobalt é consultado de novo na hora de baixar.
- Nada é inventado. Sem `YOUTUBE_API_KEY` não há duração. O tamanho só aparece quando a fonte informa: com `LINK_PROXY_YOUTUBE_SIZES = true` o Worker pergunta ao Cobalt, e tamanho sem Content-Length exato aparece como estimado. Túneis com remux costumam não ter tamanho, então o progresso mostra os MB recebidos, sem total.

## Variáveis do Worker

| Variável | Tipo | Obrigatória | Uso |
| --- | --- | --- | --- |
| `COBALT_API_URL` | variável | sim | Raiz da API da sua instância (POST `/`), como `https://cobalt.exemplo.com/`. HTTPS na porta 443. Sem ela o YouTube fica desligado, com um erro claro. |
| `COBALT_API_KEY` | secret | se a instância exigir | Enviada como `Authorization: Api-Key ...`. Nunca vai ao navegador. |
| `YOUTUBE_API_KEY` | secret | não | YouTube Data API v3, só para a duração. |
| `TOKEN_KEY` (ou `SECRET`) | secret | sim | Já usada pelo Worker. Cifra os links `/yt/dl`. |
| `YT_QUALITIES` | variável | não | Padrão `2160:vp9,1440:vp9,1080,720,480,360`. Cada camada custa uma requisição ao Cobalt por busca, mais uma para o áudio. Acima de 1080p o YouTube só publica VP9 ou AV1 (WebM). |

```bash
npx wrangler secret put COBALT_API_KEY
npx wrangler secret put YOUTUBE_API_KEY
```

Depois de publicar, abra `https://SEU-WORKER/yt/status?key=SEU_SECRET`, ou use a aba de diagnóstico do script. Ele faz uma requisição real à sua instância e confere a versão e se o serviço `youtube` está ativo.

## Sua instância do Cobalt

Hospede a sua seguindo `docs/run-an-instance.md` e `docs/protect-an-instance.md` no repositório do Cobalt e crie uma chave de API para o Worker.

A documentação do Cobalt pede que instâncias hospedadas por terceiros **não** sejam usadas por outros projetos sem permissão. Por isso este repositório não embute nenhuma instância pública ou da comunidade.

O YouTube costuma exigir sessão ou cookies no servidor do Cobalt. Isso é configuração dele: o Worker não contorna login nem controles de acesso. O limite padrão de requisições do Cobalt também pode ser atingido, já que cada busca faz cerca de 7 POSTs. Aumente `RATE_LIMIT_MAX` no Cobalt ou reduza `YT_QUALITIES`.

## Dependências e licenças

- Nenhuma biblioteca nova no userscript nem no Worker para este recurso.
- Serviços externos: sua instância do Cobalt (obrigatória), oEmbed do YouTube (sem chave) e YouTube Data API v3 (opcional).
- O Cobalt é usado só pela API HTTP e tem licença AGPL-3.0. Se você modificar e hospedar o Cobalt, a AGPL se aplica à sua instância. Confira a licença atual no repositório dele.

## Opções no userscript

| Constante | Efeito |
| --- | --- |
| `LINK_PROXY_YOUTUBE = false` | Desliga o YouTube por completo. O script nunca envia links do YouTube ao Worker. |
| `LINK_PROXY_YOUTUBE_SIZES = true` | Pergunta ao Cobalt o tamanho de cada opção durante a busca. Mais requisições ao Cobalt. |

## Limites e avisos

- Sem playlists, transmissões ao vivo nem conteúdo que exija login. Se o Cobalt falhar para o YouTube, o que acontece porque o YouTube muda com frequência, a mensagem do Worker diz o que atualizar.
- A detecção automática de mídia dentro do youtube.com continua desligada. Cole o link na aba **Por link**.
- Os arquivos passam pela memória do navegador, como em qualquer outro download, então vídeos muito grandes podem falhar no celular.
- O formato do nome de arquivo que o Cobalt devolve e os códigos de erro dele foram implementados a partir da documentação e do código do Cobalt. Se a sua versão mudar o nome, as opções aparecem como "até Np" com um aviso, sem inventar resolução.
- Os testes do autor usaram um Cobalt e um YouTube simulados, não os reais, então espere ajustar algo no primeiro uso.

## Uso responsável

Baixar vídeos de terceiros pode violar os Termos de Serviço do YouTube e os direitos autorais. Use para conteúdo seu ou licenciado. Para os seus próprios vídeos, o YouTube Studio e o Google Takeout são opções melhores.
