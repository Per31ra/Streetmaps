// Configuração do StreetMaps.
// Sem chaves do Supabase a app arranca em MODO DEMO: mapa real e o teu GPS,
// mas com condutores simulados e dados guardados só no teu telemóvel.
// A "anon key" do Supabase é pública por natureza; a segurança vem das regras (RLS) em supabase/schema.sql.
window.STREETMAPS_CONFIG = {
  supabaseUrl: "",      // ex.: "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",  // Project Settings > API > anon public
  mapStyle: "https://tiles.openfreemap.org/styles/dark",
};
