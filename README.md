# StreetMaps

O mapa ao vivo da comunidade tuning: mapa real do mundo inteiro com visual néon ao estilo Need for Speed, a tua localização por GPS, condutores da comunidade em tempo real, perfis com a garagem de cada um, eventos e alertas da estrada.

É uma app web: abre-se no browser do telemóvel e pode ser adicionada ao ecrã principal ("Adicionar ao ecrã principal" no Safari ou no Chrome), ficando como uma app.

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

## Privacidade

- A posição só é partilhada com a app aberta, a cada 3 segundos, e nunca fica guardada na base de dados.
- A velocidade é mostrada só ao próprio condutor.
- Modo fantasma: vês os outros e ninguém te vê.
- Zona privada: dentro de 500 m de um ponto à tua escolha (por exemplo, casa) não és mostrado.

## Tecnologia

- Mapa: [MapLibre GL JS](https://maplibre.org) com mapas do [OpenFreeMap](https://openfreemap.org) (dados © OpenStreetMap). Estradas por cor: autoestradas a azul, nacionais a amarelo, municipais a verde.
- Tempo real, contas e base de dados: [Supabase](https://supabase.com).
- Sem passo de build: HTML, CSS e JavaScript simples.

## Próximos passos

- Pesquisa de destinos e navegação curva a curva.
- Conta com email para não perder o perfil ao mudar de telemóvel.
- Amigos e convites para eventos.
- App nativa (React Native) para partilhar a posição em segundo plano.
