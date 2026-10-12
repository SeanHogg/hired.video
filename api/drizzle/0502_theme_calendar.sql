-- Migration 0502 — Theme calendar (gap #2350).
--
-- The internal calendar that picks a video's default theme by date
-- (Halloween through October, Graduation season in May…), fills the home
-- page's "in season" row, and is edited by SuperAdmins in Studio › Calendar
-- & themes. Every theme is free; the person can always pick another.
--
--   theme_calendar_events — one row per event: how its main day is found
--     each year (`rule`, see shared/theme-calendar/event.ts DateRuleSchema),
--     its run-up window, who it picks automatically, regions, priority, the
--     theme (shared/video-themes.ts) and its localized name + opening line.
--   theme_calendar_dates  — the yearly table: dates an admin enters once a
--     year for lunar, religious and sports events (rule.type = 'table').
--
-- Personal moments (birthday, work anniversary…) are events too, but their
-- dates never come here: the picker reads them from the person's own info
-- in their browser (shared/theme-calendar/pick.ts).
--
-- Idempotent: IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.

CREATE TABLE IF NOT EXISTS theme_calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        varchar(48) NOT NULL,
  kind        varchar(16) NOT NULL
              CHECK (kind IN ('personal','career','holiday','sports','season','offered','custom')),
  rule        jsonb NOT NULL,
  runup_days  integer NOT NULL DEFAULT 0 CHECK (runup_days BETWEEN 0 AND 120),
  after_days  integer NOT NULL DEFAULT 0 CHECK (after_days BETWEEN 0 AND 180),
  auto_pick   varchar(16) NOT NULL DEFAULT 'everyone'
              CHECK (auto_pick IN ('everyone','whenFits','never')),
  fits        text[] NOT NULL DEFAULT ARRAY[]::text[],
  regions     text[] NOT NULL DEFAULT ARRAY[]::text[],
  priority    integer NOT NULL DEFAULT 300 CHECK (priority BETWEEN 0 AND 500),
  theme_id    varchar(32) NOT NULL,
  tone        varchar(16) NOT NULL DEFAULT 'warm'
              CHECK (tone IN ('playful','warm','respectful')),
  name        jsonb NOT NULL,
  line        jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  is_builtin  boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_theme_calendar_events_slug ON theme_calendar_events (slug);

CREATE TABLE IF NOT EXISTS theme_calendar_dates (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  uuid NOT NULL REFERENCES theme_calendar_events(id) ON DELETE CASCADE,
  year      integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  date      date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_theme_calendar_dates_event_year ON theme_calendar_dates (event_id, year);

-- Built-in events (2026 board). SuperAdmins can edit or turn any of them off;
-- re-running this migration never overwrites their edits (DO NOTHING).
INSERT INTO theme_calendar_events
  (slug, kind, rule, runup_days, after_days, auto_pick, fits, regions, priority, theme_id, tone, name, line, is_builtin)
VALUES
  ('new-year', 'career', '{"type": "fixed", "month": 1, "day": 1}'::jsonb, 0, 30, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 400, 'newyear', 'playful', '{"en": "New year, new role", "es": "Año nuevo, empleo nuevo", "fr-CA": "Nouvelle année, nouveau poste"}'::jsonb, '{"en": "New year, new role.", "es": "Año nuevo, empleo nuevo.", "fr-CA": "Nouvelle année, nouveau poste."}'::jsonb, true),
  ('mlk-day', 'offered', '{"type": "nthWeekday", "month": 1, "weekday": 1, "nth": 3}'::jsonb, 7, 0, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "MLK Day of Service", "es": "Día de Servicio MLK", "fr-CA": "Journée de service MLK"}'::jsonb, NULL, true),
  ('big-game', 'sports', '{"type": "table"}'::jsonb, 14, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 200, 'biggame', 'playful', '{"en": "The Big Game (pro football)", "es": "El Gran Juego (fútbol americano)", "fr-CA": "Le grand match (football)"}'::jsonb, '{"en": "Game-day ready for your team.", "es": "Listo para el gran día con tu equipo.", "fr-CA": "Prêt pour le grand match avec votre équipe."}'::jsonb, true),
  ('black-history-month', 'offered', '{"type": "fixed", "month": 2, "day": 1}'::jsonb, 0, 27, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "Black History Month", "es": "Mes de la Historia Afroamericana", "fr-CA": "Mois de l’histoire des Noirs"}'::jsonb, NULL, true),
  ('valentines-day', 'holiday', '{"type": "fixed", "month": 2, "day": 14}'::jsonb, 13, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'valentine', 'playful', '{"en": "Valentine’s Day", "es": "San Valentín", "fr-CA": "Saint-Valentin"}'::jsonb, '{"en": "Love what you do? So do I.", "es": "¿Amas lo que haces? Yo también.", "fr-CA": "Vous aimez ce que vous faites? Moi aussi."}'::jsonb, true),
  ('winter-games', 'sports', '{"type": "table"}'::jsonb, 0, 16, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 200, 'wintergames', 'playful', '{"en": "Winter Games", "es": "Juegos de Invierno", "fr-CA": "Jeux d’hiver"}'::jsonb, '{"en": "Going for gold in my next role.", "es": "Voy por el oro en mi próximo empleo.", "fr-CA": "Je vise l’or dans mon prochain poste."}'::jsonb, true),
  ('lunar-new-year', 'offered', '{"type": "table"}'::jsonb, 7, 0, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Lunar New Year", "es": "Año Nuevo Lunar", "fr-CA": "Nouvel An lunaire"}'::jsonb, NULL, true),
  ('ramadan-eid', 'offered', '{"type": "table"}'::jsonb, 30, 0, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Ramadan & Eid al-Fitr", "es": "Ramadán y Eid al-Fitr", "fr-CA": "Ramadan et Aïd al-Fitr"}'::jsonb, NULL, true),
  ('womens-history-month', 'offered', '{"type": "fixed", "month": 3, "day": 8}'::jsonb, 7, 23, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Women’s History Month · International Women’s Day", "es": "Mes de la Historia de la Mujer · Día Internacional de la Mujer", "fr-CA": "Mois de l’histoire des femmes · Journée internationale des femmes"}'::jsonb, NULL, true),
  ('st-patricks-day', 'holiday', '{"type": "fixed", "month": 3, "day": 17}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'stpat', 'playful', '{"en": "St. Patrick’s Day", "es": "Día de San Patricio", "fr-CA": "Saint-Patrick"}'::jsonb, '{"en": "Luck is a plan. Here is mine.", "es": "La suerte es un plan. Este es el mío.", "fr-CA": "La chance, c’est un plan. Voici le mien."}'::jsonb, true),
  ('bracket-season', 'sports', '{"type": "table"}'::jsonb, 22, 0, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 200, 'bracket', 'playful', '{"en": "Bracket season (college hoops)", "es": "Temporada de eliminatorias (básquet universitario)", "fr-CA": "Saison des séries (basket universitaire)"}'::jsonb, '{"en": "A top seed for your team.", "es": "Un primer sembrado para tu equipo.", "fr-CA": "Une tête de série pour votre équipe."}'::jsonb, true),
  ('baseball-opening-day', 'sports', '{"type": "table"}'::jsonb, 6, 0, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 200, 'baseball', 'playful', '{"en": "Baseball Opening Day", "es": "Día inaugural del béisbol", "fr-CA": "Journée d’ouverture du baseball"}'::jsonb, '{"en": "Stepping up to the plate.", "es": "Listo para batear.", "fr-CA": "Prêt à monter au bâton."}'::jsonb, true),
  ('spring-easter', 'holiday', '{"type": "computed", "point": "easter"}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'spring', 'warm', '{"en": "Spring & Easter", "es": "Primavera y Pascua", "fr-CA": "Printemps et Pâques"}'::jsonb, '{"en": "Fresh season, fresh start.", "es": "Nueva temporada, nuevo comienzo.", "fr-CA": "Nouvelle saison, nouveau départ."}'::jsonb, true),
  ('earth-day', 'offered', '{"type": "fixed", "month": 4, "day": 22}'::jsonb, 7, 0, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Earth Day", "es": "Día de la Tierra", "fr-CA": "Jour de la Terre"}'::jsonb, NULL, true),
  ('graduation-season', 'career', '{"type": "fixed", "month": 5, "day": 15}'::jsonb, 14, 31, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 400, 'grad', 'warm', '{"en": "Graduation season", "es": "Temporada de graduaciones", "fr-CA": "Saison des remises de diplômes"}'::jsonb, '{"en": "A new graduate, ready to work.", "es": "Recién graduado, listo para trabajar.", "fr-CA": "Nouveau diplômé, prêt à travailler."}'::jsonb, true),
  ('aapi-heritage-month', 'offered', '{"type": "fixed", "month": 5, "day": 1}'::jsonb, 0, 30, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "AAPI Heritage Month", "es": "Mes de la Herencia AAPI", "fr-CA": "Mois du patrimoine asiatique"}'::jsonb, NULL, true),
  ('mothers-day', 'holiday', '{"type": "nthWeekday", "month": 5, "weekday": 0, "nth": 2}'::jsonb, 7, 0, 'everyone', ARRAY['parent']::text[], ARRAY['US','CA']::text[], 300, 'mothers', 'warm', '{"en": "Mother’s Day", "es": "Día de la Madre", "fr-CA": "Fête des Mères"}'::jsonb, '{"en": "Lessons from the best manager I know.", "es": "Lecciones de la mejor jefa que conozco.", "fr-CA": "Des leçons de la meilleure gestionnaire que je connaisse."}'::jsonb, true),
  ('memorial-day', 'offered', '{"type": "nthWeekday", "month": 5, "weekday": 1, "nth": -1}'::jsonb, 0, 0, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "Memorial Day", "es": "Día de los Caídos", "fr-CA": "Memorial Day"}'::jsonb, NULL, true),
  ('pride-month', 'offered', '{"type": "fixed", "month": 6, "day": 1}'::jsonb, 0, 29, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Pride Month", "es": "Mes del Orgullo", "fr-CA": "Mois de la Fierté"}'::jsonb, NULL, true),
  ('hoops-hockey-finals', 'sports', '{"type": "table"}'::jsonb, 14, 5, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 200, 'finals', 'playful', '{"en": "Hoops & hockey finals", "es": "Finales de básquet y hockey", "fr-CA": "Finales de basket et de hockey"}'::jsonb, '{"en": "Built for the big moments.", "es": "Hecho para los grandes momentos.", "fr-CA": "Fait pour les grands moments."}'::jsonb, true),
  ('summer-of-soccer', 'sports', '{"type": "table"}'::jsonb, 0, 38, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 200, 'soccer', 'playful', '{"en": "Summer of soccer", "es": "Verano de fútbol", "fr-CA": "Été du soccer"}'::jsonb, '{"en": "A team player, on and off the pitch.", "es": "Juego en equipo, dentro y fuera de la cancha.", "fr-CA": "Un joueur d’équipe, sur le terrain comme ailleurs."}'::jsonb, true),
  ('fathers-day', 'holiday', '{"type": "nthWeekday", "month": 6, "weekday": 0, "nth": 3}'::jsonb, 7, 0, 'everyone', ARRAY['parent']::text[], ARRAY['US','CA']::text[], 300, 'fathers', 'warm', '{"en": "Father’s Day", "es": "Día del Padre", "fr-CA": "Fête des Pères"}'::jsonb, '{"en": "Built to show up, every day.", "es": "Hecho para estar presente, cada día.", "fr-CA": "Toujours là, chaque jour."}'::jsonb, true),
  ('juneteenth', 'offered', '{"type": "fixed", "month": 6, "day": 19}'::jsonb, 0, 0, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "Juneteenth", "es": "Juneteenth", "fr-CA": "Juneteenth"}'::jsonb, NULL, true),
  ('canada-day', 'holiday', '{"type": "fixed", "month": 7, "day": 1}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY['CA']::text[], 300, 'canada', 'warm', '{"en": "Canada Day", "es": "Día de Canadá", "fr-CA": "Fête du Canada"}'::jsonb, '{"en": "Proudly ready to work.", "es": "Con orgullo, listo para trabajar.", "fr-CA": "Fièrement prêt à travailler."}'::jsonb, true),
  ('fourth-of-july', 'holiday', '{"type": "fixed", "month": 7, "day": 4}'::jsonb, 6, 0, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 300, 'july4', 'playful', '{"en": "Fourth of July", "es": "Cuatro de Julio", "fr-CA": "Fête de l’Indépendance américaine"}'::jsonb, '{"en": "Independent, and ready to join your team.", "es": "Independiente y listo para unirme a tu equipo.", "fr-CA": "Indépendant, et prêt à rejoindre votre équipe."}'::jsonb, true),
  ('back-to-school', 'holiday', '{"type": "fixed", "month": 9, "day": 1}'::jsonb, 31, 6, 'whenFits', ARRAY['student','teacher','parent']::text[], ARRAY['US','CA']::text[], 300, 'school', 'warm', '{"en": "Back to school", "es": "Regreso a clases", "fr-CA": "Rentrée scolaire"}'::jsonb, '{"en": "Class is in session. So is my job search.", "es": "Las clases empezaron. Mi búsqueda de empleo también.", "fr-CA": "Les cours reprennent. Ma recherche d’emploi aussi."}'::jsonb, true),
  ('labor-day', 'career', '{"type": "nthWeekday", "month": 9, "weekday": 1, "nth": 1}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 400, 'labor', 'warm', '{"en": "Labor Day", "es": "Día del Trabajo", "fr-CA": "Fête du Travail"}'::jsonb, '{"en": "Back to work, on the right team.", "es": "De vuelta al trabajo, en el equipo correcto.", "fr-CA": "De retour au travail, dans la bonne équipe."}'::jsonb, true),
  ('labour-day-ca', 'career', '{"type": "nthWeekday", "month": 9, "weekday": 1, "nth": 1}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY['CA']::text[], 400, 'labor', 'warm', '{"en": "Labour Day", "es": "Día del Trabajo", "fr-CA": "Fête du Travail"}'::jsonb, '{"en": "Back to work, on the right team.", "es": "De vuelta al trabajo, en el equipo correcto.", "fr-CA": "De retour au travail, dans la bonne équipe."}'::jsonb, true),
  ('football-kickoff', 'sports', '{"type": "table"}'::jsonb, 7, 20, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 200, 'football', 'playful', '{"en": "Football season kickoff", "es": "Arranque de la temporada de fútbol americano", "fr-CA": "Début de la saison de football"}'::jsonb, '{"en": "Ready to suit up for your team.", "es": "Listo para ponerme el uniforme de tu equipo.", "fr-CA": "Prêt à enfiler l’uniforme de votre équipe."}'::jsonb, true),
  ('hispanic-heritage-month', 'offered', '{"type": "fixed", "month": 9, "day": 15}'::jsonb, 0, 30, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "Hispanic Heritage Month", "es": "Mes de la Herencia Hispana", "fr-CA": "Mois du patrimoine hispanique"}'::jsonb, NULL, true),
  ('coffee-day', 'holiday', '{"type": "fixed", "month": 9, "day": 29}'::jsonb, 2, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'coffee', 'playful', '{"en": "National Coffee Day", "es": "Día Nacional del Café", "fr-CA": "Journée nationale du café"}'::jsonb, '{"en": "Fully caffeinated and ready to start.", "es": "Con café y listo para empezar.", "fr-CA": "Bien caféiné et prêt à commencer."}'::jsonb, true),
  ('halloween', 'holiday', '{"type": "fixed", "month": 10, "day": 31}'::jsonb, 30, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'halloween', 'playful', '{"en": "Halloween", "es": "Halloween", "fr-CA": "Halloween"}'::jsonb, '{"en": "No tricks. Just results.", "es": "Sin trucos. Solo resultados.", "fr-CA": "Pas de tours. Juste des résultats."}'::jsonb, true),
  ('thanksgiving-ca', 'holiday', '{"type": "nthWeekday", "month": 10, "weekday": 1, "nth": 2}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY['CA']::text[], 300, 'thanks', 'warm', '{"en": "Thanksgiving (Canada)", "es": "Acción de Gracias (Canadá)", "fr-CA": "Action de grâce"}'::jsonb, '{"en": "Grateful for where I’ve been.", "es": "Agradecido por mi camino.", "fr-CA": "Reconnaissant pour le chemin parcouru."}'::jsonb, true),
  ('bosss-day', 'offered', '{"type": "fixed", "month": 10, "day": 16}'::jsonb, 7, 0, 'whenFits', ARRAY['hiringManager']::text[], ARRAY['US']::text[], 0, 'boss', 'warm', '{"en": "Boss’s Day", "es": "Día del Jefe", "fr-CA": "Journée des patrons"}'::jsonb, '{"en": "Every great team starts with the right hire.", "es": "Todo gran equipo empieza con la contratación correcta.", "fr-CA": "Toute grande équipe commence par la bonne embauche."}'::jsonb, true),
  ('sweetest-day', 'holiday', '{"type": "nthWeekday", "month": 10, "weekday": 6, "nth": 3}'::jsonb, 7, 0, 'everyone', ARRAY[]::text[], ARRAY['US-MW']::text[], 300, 'sweetest', 'playful', '{"en": "Sweetest Day", "es": "Sweetest Day", "fr-CA": "Sweetest Day"}'::jsonb, '{"en": "Sweet results, no sugarcoating.", "es": "Resultados dulces, sin endulzar nada.", "fr-CA": "Des résultats sucrés, sans enrober."}'::jsonb, true),
  ('fall-classic', 'sports', '{"type": "table"}'::jsonb, 4, 7, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 200, 'baseball', 'playful', '{"en": "Fall Classic (baseball)", "es": "Clásico de Otoño (béisbol)", "fr-CA": "Classique d’automne (baseball)"}'::jsonb, '{"en": "Clutch when it counts.", "es": "Decisivo cuando importa.", "fr-CA": "Solide quand ça compte."}'::jsonb, true),
  ('dia-de-los-muertos', 'offered', '{"type": "fixed", "month": 11, "day": 1}'::jsonb, 4, 1, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Día de los Muertos", "es": "Día de los Muertos", "fr-CA": "Jour des Morts"}'::jsonb, NULL, true),
  ('diwali', 'offered', '{"type": "table"}'::jsonb, 7, 0, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Diwali", "es": "Diwali", "fr-CA": "Diwali"}'::jsonb, NULL, true),
  ('veterans-day', 'offered', '{"type": "fixed", "month": 11, "day": 11}'::jsonb, 7, 0, 'whenFits', ARRAY['veteran']::text[], ARRAY['US']::text[], 0, 'veteran', 'warm', '{"en": "Veterans Day", "es": "Día de los Veteranos", "fr-CA": "Jour des vétérans"}'::jsonb, '{"en": "Veteran, ready for my next mission.", "es": "Veterano, listo para mi próxima misión.", "fr-CA": "Vétéran, prêt pour ma prochaine mission."}'::jsonb, true),
  ('remembrance-day', 'offered', '{"type": "fixed", "month": 11, "day": 11}'::jsonb, 7, 0, 'whenFits', ARRAY['veteran']::text[], ARRAY['CA']::text[], 0, 'veteran', 'respectful', '{"en": "Remembrance Day", "es": "Día del Recuerdo", "fr-CA": "Jour du Souvenir"}'::jsonb, NULL, true),
  ('thanksgiving', 'holiday', '{"type": "nthWeekday", "month": 11, "weekday": 4, "nth": 4}'::jsonb, 10, 0, 'everyone', ARRAY[]::text[], ARRAY['US']::text[], 300, 'thanks', 'warm', '{"en": "Thanksgiving", "es": "Acción de Gracias", "fr-CA": "Action de grâce (États-Unis)"}'::jsonb, '{"en": "Grateful for where I’ve been. Ready for what’s next.", "es": "Agradecido por mi camino. Listo para lo que sigue.", "fr-CA": "Reconnaissant pour le chemin parcouru. Prêt pour la suite."}'::jsonb, true),
  ('christmas', 'holiday', '{"type": "fixed", "month": 12, "day": 25}'::jsonb, 24, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'christmas', 'warm', '{"en": "Christmas", "es": "Navidad", "fr-CA": "Noël"}'::jsonb, '{"en": "The hire your team will thank you for in January.", "es": "La contratación que tu equipo te agradecerá en enero.", "fr-CA": "L’embauche dont votre équipe vous remerciera en janvier."}'::jsonb, true),
  ('winter-holidays', 'holiday', '{"type": "fixed", "month": 12, "day": 24}'::jsonb, 23, 1, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'holidays', 'warm', '{"en": "Winter holidays", "es": "Fiestas de invierno", "fr-CA": "Fêtes de fin d’année"}'::jsonb, '{"en": "Wrapping up the year, ready for what’s next.", "es": "Cerrando el año, listo para lo que sigue.", "fr-CA": "Je termine l’année, prêt pour la suite."}'::jsonb, true),
  ('hanukkah', 'offered', '{"type": "table"}'::jsonb, 0, 8, 'never', ARRAY[]::text[], ARRAY[]::text[], 0, 'observe', 'respectful', '{"en": "Hanukkah", "es": "Janucá", "fr-CA": "Hanoucca"}'::jsonb, NULL, true),
  ('kwanzaa', 'offered', '{"type": "fixed", "month": 12, "day": 26}'::jsonb, 0, 6, 'never', ARRAY[]::text[], ARRAY['US']::text[], 0, 'observe', 'respectful', '{"en": "Kwanzaa", "es": "Kwanzaa", "fr-CA": "Kwanzaa"}'::jsonb, NULL, true),
  ('new-years-eve', 'holiday', '{"type": "fixed", "month": 12, "day": 31}'::jsonb, 5, 0, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 300, 'newyear', 'playful', '{"en": "New Year’s Eve", "es": "Nochevieja", "fr-CA": "Veille du jour de l’An"}'::jsonb, '{"en": "Ready for the new year.", "es": "Listo para el año nuevo.", "fr-CA": "Prêt pour la nouvelle année."}'::jsonb, true),
  ('season-winter', 'season', '{"type": "fixed", "month": 12, "day": 1}'::jsonb, 0, 108, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 100, 'winter', 'warm', '{"en": "Winter", "es": "Invierno", "fr-CA": "Hiver"}'::jsonb, '{"en": "Ready to warm up your team.", "es": "Listo para darle calor a tu equipo.", "fr-CA": "Prêt à réchauffer votre équipe."}'::jsonb, true),
  ('season-spring', 'season', '{"type": "computed", "point": "springEquinox"}'::jsonb, 0, 92, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 100, 'spring', 'warm', '{"en": "Spring", "es": "Primavera", "fr-CA": "Printemps"}'::jsonb, '{"en": "Fresh season, fresh start.", "es": "Nueva temporada, nuevo comienzo.", "fr-CA": "Nouvelle saison, nouveau départ."}'::jsonb, true),
  ('season-summer', 'season', '{"type": "computed", "point": "summerSolstice"}'::jsonb, 0, 92, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 100, 'summer', 'playful', '{"en": "Summer", "es": "Verano", "fr-CA": "Été"}'::jsonb, '{"en": "Ready to make this summer count.", "es": "Listo para que este verano cuente.", "fr-CA": "Prêt à faire compter cet été."}'::jsonb, true),
  ('season-fall', 'season', '{"type": "computed", "point": "fallEquinox"}'::jsonb, 0, 69, 'everyone', ARRAY[]::text[], ARRAY[]::text[], 100, 'fall', 'warm', '{"en": "Fall · Cider & pumpkins", "es": "Otoño · sidra y calabazas", "fr-CA": "Automne · cidre et citrouilles"}'::jsonb, '{"en": "New season. Ready for a new role.", "es": "Nueva temporada. Listo para un nuevo empleo.", "fr-CA": "Nouvelle saison. Prêt pour un nouveau poste."}'::jsonb, true),
  ('birthday', 'personal', '{"type": "person", "moment": "birthday"}'::jsonb, 7, 0, 'whenFits', ARRAY['person']::text[], ARRAY[]::text[], 500, 'birthday', 'playful', '{"en": "Your birthday", "es": "Tu cumpleaños", "fr-CA": "Votre anniversaire"}'::jsonb, '{"en": "Another year wiser, and ready for what’s next.", "es": "Un año más sabio y listo para lo que sigue.", "fr-CA": "Une année plus sage, et prêt pour la suite."}'::jsonb, true),
  ('work-anniversary', 'personal', '{"type": "person", "moment": "workAnniversary"}'::jsonb, 7, 0, 'whenFits', ARRAY['person']::text[], ARRAY[]::text[], 500, 'workanniv', 'warm', '{"en": "Work anniversary", "es": "Aniversario laboral", "fr-CA": "Anniversaire de travail"}'::jsonb, '{"en": "Another year of results.", "es": "Otro año de resultados.", "fr-CA": "Une autre année de résultats."}'::jsonb, true),
  ('graduation', 'personal', '{"type": "person", "moment": "graduation"}'::jsonb, 14, 30, 'whenFits', ARRAY['person']::text[], ARRAY[]::text[], 500, 'grad', 'warm', '{"en": "Your graduation", "es": "Tu graduación", "fr-CA": "Votre remise de diplôme"}'::jsonb, '{"en": "A new graduate, ready to work.", "es": "Recién graduado, listo para trabajar.", "fr-CA": "Nouveau diplômé, prêt à travailler."}'::jsonb, true),
  ('wedding-anniversary', 'personal', '{"type": "person", "moment": "wedding"}'::jsonb, 7, 0, 'whenFits', ARRAY['person']::text[], ARRAY[]::text[], 500, 'wedding', 'warm', '{"en": "Wedding or anniversary", "es": "Boda o aniversario", "fr-CA": "Mariage ou anniversaire de mariage"}'::jsonb, '{"en": "Grateful, and ready for what’s next.", "es": "Agradecido y listo para lo que sigue.", "fr-CA": "Reconnaissant, et prêt pour la suite."}'::jsonb, true),
  ('in-memory', 'personal', '{"type": "person", "moment": "inMemory"}'::jsonb, 7, 7, 'whenFits', ARRAY['person']::text[], ARRAY[]::text[], 500, 'memory', 'respectful', '{"en": "In memory", "es": "En memoria", "fr-CA": "En mémoire"}'::jsonb, NULL, true)
ON CONFLICT (slug) DO NOTHING;

-- Yearly-table dates entered for 2026 (later years are entered by a SuperAdmin;
-- the editor flags any whose run-up starts within 120 days).
INSERT INTO theme_calendar_dates (event_id, year, date)
SELECT e.id, v.year, v.date
FROM (VALUES
  ('big-game', 2026, DATE '2026-02-08'),
  ('winter-games', 2026, DATE '2026-02-06'),
  ('lunar-new-year', 2026, DATE '2026-02-17'),
  ('ramadan-eid', 2026, DATE '2026-03-20'),
  ('bracket-season', 2026, DATE '2026-04-06'),
  ('baseball-opening-day', 2026, DATE '2026-03-26'),
  ('hoops-hockey-finals', 2026, DATE '2026-06-15'),
  ('summer-of-soccer', 2026, DATE '2026-06-11'),
  ('football-kickoff', 2026, DATE '2026-09-10'),
  ('fall-classic', 2026, DATE '2026-10-24'),
  ('diwali', 2026, DATE '2026-11-08'),
  ('hanukkah', 2026, DATE '2026-12-04')
) AS v(slug, year, date)
JOIN theme_calendar_events e ON e.slug = v.slug
ON CONFLICT (event_id, year) DO NOTHING;
