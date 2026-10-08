# StreetMaps

O mapa ao vivo da comunidade tuning: mapa real do mundo inteiro com visual néon ao estilo Need for Speed, a tua localização por GPS, condutores da comunidade em tempo real, perfis com a garagem de cada um, eventos e alertas da estrada.

É uma app web: abre-se no browser do telemóvel e pode ser adicionada ao ecrã principal ("Adicionar ao ecrã principal" no Safari ou no Chrome), ficando como uma app.

## O que faz

- Mapa real do mundo com estradas por cor: autoestradas a azul, nacionais a amarelo, municipais a verde.
- A tua posição por GPS, velocímetro e direção.
- Pesquisa de destinos, rota com tempo de viagem e hora de chegada, e indicações curva a curva. A rota é recalculada se te desviares.
- Alertas da comunidade (polícia, acidente, obras, piso mau): aparecem no mapa em tempo real e a rota mostra quantos há pelo caminho.
- Perfil com garagem e badges (AMG, M, RS, GTI, Type R, STI e outros). As badges são emblemas de texto próprios da StreetMaps, não os logótipos oficiais das marcas.
- Eventos e encontros no mapa, com confirmação de presença.
- Painel da comunidade (no telemóvel, desliza para cima): meets em alta, pistas em destaque, condutores perto, tema e privacidade.
- No mapa: pistas de corrida (riscadas a vermelho e branco) e bombas de gasolina ao aproximar.
- Barra de música no topo: liga o Spotify para ver o que está a tocar e mudar de música, ou abre o Apple Music.
- Botão **Satélite** para alternar entre o mapa e a vista de satélite.
- Câmara em 3.ª pessoa durante a rota, com prédios em 3D.
- Dois temas, escolhidos no Perfil: **Street** (néon azul-noite) e **Vice** (pôr do sol, rosa e turquesa, inspirado em Miami; sem logótipos nem fontes de jogos).

## Modos

- **Modo demo** (sem configuração): mapa real e o teu GPS, com condutores simulados à tua volta. Perfil, eventos e alertas ficam guardados só no teu telemóvel.
- **Ao vivo** (com Supabase): perfis, eventos, presenças e alertas partilhados por toda a gente, e as posições de quem está a conduzir a aparecer em tempo real.

## Pôr online (GitHub Pages)

1. No repositório, abre **Settings > Pages**.
2. Em **Build and deployment**, escolhe **Deploy from a branch**, branch `main` e pasta `/ (root)`, e carrega em **Save**.
3. Passado um minuto a app fica em `https://<utilizador>.github.io/<repositório>/`.

A localização só funciona em HTTPS, e o GitHub Pages já é HTTPS.

## Ligar o modo ao vivo (Supabase, gratuito)

1. Cria uma conta e um projeto em supabase.com.
2. No projeto, abre **SQL Editor**, cola o conteúdo de `supabase/schema.sql` e carrega em **Run**.
3. Em **Authentication > Sign In / Providers**, ativa **Allow anonymous sign-ins**.
4. Em **Project Settings > API**, copia o **Project URL** e a chave **anon public** para `config.js`.

A chave `anon` é pública por natureza; quem protege os dados são as regras de acesso (RLS) definidas no `schema.sql`. Nunca coloques a chave `service_role` neste repositório.

## Trânsito em tempo real (TomTom, gratuito)

Sem chave, as rotas mostram alternativas mas os tempos não contam com o trânsito. Com uma chave da TomTom, a app usa o trânsito do momento **só no cálculo**: escolhe por defeito a rota mais rápida (mesmo que seja mais longa) sem mostrar o trânsito no ecrã. Se a TomTom falhar ou o limite diário acabar, a app usa as rotas gratuitas sem trânsito.

Para mostrar também o trânsito (engarrafamentos na rota, tempo perdido e o botão "Trânsito" no mapa), põe `showTraffic: true` em `config.js`. Isso gasta mais pedidos do plano gratuito.

Como ativar:
1. Cria uma conta em developer.tomtom.com e copia a chave da API (o plano gratuito dá vários milhares de pedidos por dia).
2. No painel da TomTom, restringe a chave ao teu domínio (`per31ra.github.io`).
3. Cola a chave em `config.js`, no campo `tomtomKey`.

## Spotify (gratuito)

1. Entra em developer.spotify.com/dashboard e carrega em **Create app**.
2. Em **Redirect URIs** põe exatamente `https://per31ra.github.io/Streetmaps/` e marca **Web API**.
3. Copia o **Client ID** para `config.js`, no campo `spotifyClientId`.
4. Enquanto a app do Spotify estiver em modo de desenvolvimento, só as contas que adicionares em **User Management** a conseguem ligar.

Mudar de música precisa de Spotify Premium. O Apple Music só abre a app, porque a Apple não deixa controlar a música a partir de sites sem uma conta paga de programador.

## Privacidade

- A posição só é partilhada com a app aberta, a cada 3 segundos, e nunca fica guardada na base de dados.
- A velocidade é mostrada só ao próprio condutor.
- Modo fantasma: vês os outros e ninguém te vê.
- Zona privada: dentro de 500 m de um ponto à tua escolha (por exemplo, casa) não és mostrado.

## Tecnologia

- Mapa: [MapLibre GL JS](https://maplibre.org) com mapas do [OpenFreeMap](https://openfreemap.org) (dados © OpenStreetMap). Estradas por cor: autoestradas a azul, nacionais a amarelo, municipais a verde.
- Pesquisa: [Photon](https://photon.komoot.io) (OpenStreetMap). Rotas: servidor público de demonstração do [OSRM](https://project-osrm.org), sem trânsito em tempo real. Para muitos utilizadores convém trocar por um serviço próprio ou pago (por exemplo OpenRouteService, GraphHopper ou Mapbox) em `config.js` (`geocoderUrl`, `routerUrl`).
- Tempo real, contas e base de dados: [Supabase](https://supabase.com).
- Sem passo de build: HTML, CSS e JavaScript simples.

## Próximos passos

- Indicações por voz e trânsito em tempo real.
- Conta com email para não perder o perfil ao mudar de telemóvel.
- Amigos e convites para eventos.
- App nativa (React Native) para partilhar a posição em segundo plano.
