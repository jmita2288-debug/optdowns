<p align="center">
  <img src="assets/banner.svg" alt="OPTDOWNS" width="100%">
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licença: MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-a8f500?style=flat-square"></a>
  <img alt="Versão 2.11.0" src="https://img.shields.io/badge/vers%C3%A3o-2.11.0-2ea043?style=flat-square">
  <img alt="Userscript" src="https://img.shields.io/badge/userscript-GM%20API-0d1117?style=flat-square">
  <img alt="mux.js 6.3.0" src="https://img.shields.io/badge/mux.js-6.3.0-7c6cf0?style=flat-square">
  <img alt="Cloudflare Workers (opcional)" src="https://img.shields.io/badge/Cloudflare%20Workers-opcional-f6821f?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Português</b>
</p>

---

O OPTDOWNS é um userscript que encontra os vídeos da página em que você está e salva cada um como um arquivo MP4 comum. Ele funciona sem servidor: os streams HLS são baixados segmento por segmento e convertidos para MP4 dentro do próprio navegador, com o [mux.js](https://github.com/videojs/mux.js).

Ele foi pensado primeiro para o celular. O painel é feito para toque e o fluxo de salvamento leva em conta as particularidades do Safari no iOS. No computador, o comportamento é o mesmo.

## Índice

- [Recursos](#recursos)
- [Como funciona](#como-funciona)
- [Tecnologias](#tecnologias)
- [Instalação](#instalação)
- [Como usar](#como-usar)
- [Cloudflare Worker opcional](#cloudflare-worker-opcional)
- [Configuração](#configuração)
- [Privacidade e rede](#privacidade-e-rede)
- [Limitações](#limitações)
- [Uso responsável](#uso-responsável)
- [Solução de problemas](#solução-de-problemas)
- [Créditos](#créditos)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

## Recursos

- **Encontra a mídia sozinho.** Observa elementos de vídeo, requisições de rede, entradas de performance e metadados da página, e lista o que achou em cards com miniatura, duração e resolução.
- **HLS para MP4 no seu aparelho.** Lê as playlists master e de mídia, deixa você escolher a qualidade do vídeo e a faixa de áudio, baixa os segmentos com pré-carregamento e junta tudo em um único MP4 dentro de um Web Worker.
- **HLS criptografado, dentro de limites.** Streams protegidos com AES-128 simples e chave pública são aceitos. O que exige DRM é recusado, nunca contornado.
- **Arquivos diretos.** Links MP4, WebM e MOV são baixados em blocos com Range e novas tentativas, então arquivos grandes não dependem de uma única requisição longa.
- **Escolha de qualidade.** As variantes do mesmo vídeo são agrupadas e você escolhe a qualidade antes de o download começar.
- **Download por link.** Cole o link de um arquivo, de uma playlist, de uma publicação pública do TikTok ou do Instagram, ou de uma página cheia de vídeos. As seções "Este vídeo" e "Vídeos da página" ficam separadas, e você navega pela lista e escolhe um.
- **Verificação do arquivo.** O resultado é inspecionado antes de salvar, então uma página de erro em HTML não vira um `video.mp4`. Depois de salvar, você vê um resumo curto de codecs e resolução.
- **Diagnóstico integrado.** Uma aba de relatório faz checagens do ambiente, guarda os erros recentes com sugestões de correção e copia um relatório com tokens e cookies mascarados.
- **Logos e miniaturas.** As logos das fontes ficam em cache local e as miniaturas são carregadas com o referrer que o site espera.

## Como funciona

<p align="center">
  <img src="assets/flow.svg" alt="Detectar, resolver, baixar, processar localmente com mux.js, salvar. Cloudflare Worker opcional como alternativa." width="100%">
</p>

1. **Detectar.** Ganchos em `fetch`/`XHR`, um `PerformanceObserver`, um observador do DOM e os metadados da página alimentam uma única lista de candidatos.
2. **Resolver.** Playlists master HLS, manifestos DASH, arquivos diretos e páginas públicas viram opções concretas (qualidade, áudio, codec).
3. **Baixar.** As requisições passam pelo `GM_xmlhttpRequest` do gerenciador de userscripts, que é o que torna a mídia de outros domínios acessível. As falhas são classificadas, repetidas e, em alguns casos, a página de origem é lida de novo para renovar uma URL expirada.
4. **Processar.** Os segmentos HLS são convertidos pelo mux.js dentro de um Web Worker, e a página continua responsiva.
5. **Salvar.** O resultado é validado e entregue ao `GM_download` ou, nos navegadores que precisam, a um download por blob ou à folha de compartilhamento.

## Tecnologias

<p align="center">
  <img src="assets/stack.svg" alt="JavaScript puro, HTML5, CSS3, Cloudflare Workers, mux.js, HLS e fMP4, Web Crypto API, GM API de userscript" width="720">
</p>

| Parte | Tecnologia | Observações |
| --- | --- | --- |
| Userscript | JavaScript puro | Um único arquivo, sem build e sem framework |
| Interface do painel | HTML e CSS injetados pelo script | Mobile first, ícones SVG embutidos |
| HLS para MP4 | [mux.js](https://github.com/videojs/mux.js) 6.3.0 | Carregado do unpkg, roda em um Web Worker |
| Inspeção de MP4 | Parser próprio de caixas ISO BMFF | Valida a saída e descreve os codecs |
| Descriptografia local | Web Crypto API | Segmentos HLS AES-128 com chave pública |
| Proxy opcional | Cloudflare Workers | JavaScript puro, sem dependências, veja [`worker/`](worker/) |

## Instalação

1. Instale um gerenciador de userscripts que aceite `@require`, `GM_xmlhttpRequest` e `@connect`, como Tampermonkey ou Violentmonkey.
2. Abra o arquivo bruto e confirme a instalação:

   **[optdowns.user.js](https://raw.githubusercontent.com/jmita2288-debug/optdowns/main/optdowns.user.js)**

3. Permita o acesso entre domínios que o gerenciador pedir. O script precisa dele para ler mídia hospedada em outros domínios.

As atualizações chegam pela verificação normal do gerenciador.

## Como usar

Abra qualquer página, toque no botão flutuante e o painel aparece.

- **Nesta página** lista o que o script detectou enquanto você navega. Escolha a qualidade, toque em baixar e o progresso aparece no card.
- **Por link** recebe uma URL colada. Use o botão de limpar para esvaziar o campo e colar o próximo link. Os links recentes ficam a um toque.
- **Fontes** mostra os tipos de link que ele entende: publicações públicas do TikTok e do Instagram, arquivos de vídeo diretos, playlists `.m3u8` e páginas com vários vídeos.
- **Diagnóstico** verifica o ambiente, mostra os erros recentes com dicas, aplica as correções seguras e copia um relatório que você pode anexar a uma issue.

Alguns sites só liberam a mídia dentro do próprio player. Quando é o caso, o script avisa em vez de tentar adivinhar.

## Cloudflare Worker opcional

O Worker é uma alternativa, não um requisito. O script resolve a maioria dos links sozinho, no navegador. O Worker ajuda quando um CDN recusa requisições diretas do navegador, o que é comum com links do TikTok.

**Este repositório não oferece um Worker hospedado, e você não deve usar o de outra pessoa.** Publique a sua própria cópia a partir de [`worker/worker.js`](worker/worker.js). O passo a passo, as variáveis de ambiente e o modelo de segurança estão em [`worker/README.md`](worker/README.md).

Depois de publicar, cole o endereço dele em `LINK_PROXY`, no topo do userscript.

## Configuração

As opções ficam no topo do `optdowns.user.js`:

| Constante | Padrão | Significado |
| --- | --- | --- |
| `LINK_PROXY` | `''` | Endereço do seu Worker. Vazio significa que o Worker nunca é chamado. |
| `LINK_PROXY_KEY` | `''` | Mesmo valor do `SECRET` do Worker, só se você definiu um. |
| `LINK_PROXY_GENERIC` | `true` | Permite que links que não são do TikTok usem o Worker como último recurso. Com `false`, só links do TikTok são enviados. |

## Privacidade e rede

O OPTDOWNS não tem contas, análise de uso nem telemetria. Mesmo assim, um downloader precisa falar com a rede, então aqui está exatamente o que ele faz:

- **Requisições de mídia** vão direto do seu navegador para o site que hospeda a mídia, pelo gerenciador de userscripts.
- **mux.js** é buscado no `unpkg.com`, fixado na versão 6.3.0.
- **Logos dos sites** são pedidas a serviços públicos de favicon (Google e DuckDuckGo). Só o nome do host é enviado, e o resultado fica em cache no `localStorage`.
- **Armazenamento local** guarda seus últimos links, o cache de logos e uma marca de primeiro uso. Nada além disso é salvo.
- **Seu Worker**, se você configurar um, recebe o link que você está baixando e uma pequena requisição de teste quando você roda o diagnóstico. Nada mais é enviado a ele.

O relatório de diagnóstico mascara tokens, cookies e query strings antes de você copiar.

## Limitações

- Sem DRM. Streams Widevine, PlayReady, FairPlay e SAMPLE-AES são recusados, assim como paywalls e áreas que exigem login.
- Faixas DASH separadas de vídeo e áudio não são mescladas.
- Alguns sites prendem a mídia à sessão do player, à rede ou a um token do navegador. Fora do player, essas URLs são rejeitadas e o script informa.
- Sites mudam. A extração de uma plataforma específica pode quebrar sem aviso, e é para isso que existe a aba de diagnóstico.
- O Safari no iOS pode exigir um toque extra para salvar. É uma regra do navegador.

## Uso responsável

Use o OPTDOWNS para conteúdo que você tem direito de salvar, como seus próprios envios, vídeos em domínio público ou com licença aberta, e material que você pode manter offline. Respeite os termos dos sites que você visita e os direitos autorais de quem fez os vídeos.

O projeto não remove DRM e não ajuda a burlar nenhum tipo de controle de acesso. Ele é fornecido como está, e você é responsável pelo uso que faz dele. Não tem vínculo com TikTok, Instagram, Cloudflare ou Brightcove.

## Solução de problemas

| Sintoma | O que tentar |
| --- | --- |
| Nada é detectado | Inicie a reprodução uma vez e reabra o painel. Confirme que o gerenciador está com o script ativo naquele site. |
| HTTP 403, 404 ou 410 ao baixar | A URL assinada expirou. Reabra o vídeo para a página publicar uma nova ou cole o link da página de novo. |
| O download abre o vídeo em vez de salvar | O navegador bloqueou o salvamento automático. Use o botão de salvar ou abrir manualmente que o painel mostra. |
| O `mux.js` não carregou | Reinstale com a internet ligada e confirme que o `unpkg.com` está acessível. |
| Aparece um erro do Worker | Rode a aba de diagnóstico e confira `LINK_PROXY`, `ALLOWED_HOSTS`, `TOKEN_KEY` e `SECRET`. |

Ao abrir uma issue, anexe o relatório da aba de diagnóstico. Ele é seguro para compartilhar.

## Créditos

O OPTDOWNS se apoia no trabalho de outras pessoas:

- **[mux.js](https://github.com/videojs/mux.js)**, da Brightcove e dos colaboradores do Video.js, Apache-2.0. Faz a conversão de MPEG-TS para MP4. Veja [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **[Cloudflare Workers](https://developers.cloudflare.com/workers/)** executa o proxy opcional.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** é uma referência de longa data sobre como os endpoints públicos de mídia se comportam. Nenhum código do yt-dlp está incluído aqui.
- **Tampermonkey e a GM API** tornam possível um userscript entre domínios como este.
- **Serviços de favicon do Google e do DuckDuckGo** fornecem as logos dos sites.
- **[Shields.io](https://shields.io)** desenha os selos acima.

## Contribuindo

Relatos de bugs, traduções e pull requests são bem-vindos.

- Abra uma issue com o relatório de diagnóstico, o tipo de página e o que você esperava.
- Mantenha as mudanças pequenas e focadas. O script é um arquivo único de propósito.
- Se você adicionar um adaptador de plataforma, garanta que ele leia só o que a página já publica de forma pública.
- A tradução dos textos da interface ajudaria muita gente. Abra uma issue antes para combinarmos a abordagem.

## Autor

Feito por [jmita2288-debug](https://github.com/jmita2288-debug). Dúvidas e ideias são bem-vindas nas [issues](https://github.com/jmita2288-debug/optdowns/issues).

## Licença

Distribuído sob a [Licença MIT](LICENSE). Os componentes de terceiros mantêm suas próprias licenças, listadas em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
