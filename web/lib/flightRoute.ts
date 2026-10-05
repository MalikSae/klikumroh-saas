export type RouteLeg = { stops: string[]; text: string };

const STOP_SEPARATOR = /\s+-\s+/;

const toStops = (segment: string): string[] =>
  segment.split(STOP_SEPARATOR).map((p) => p.trim()).filter(Boolean);

/**
 * Flight route text from the package editor, as legs of stops. One leg per line, and a line may also
 * hold several legs separated by commas or semicolons, as in the dashboard example "CGK - JED, MED - CGK".
 * A comma only splits legs when every part is itself a route ("A - B"); otherwise the line stays one leg
 * (so a note such as "Jakarta - Jeddah, via Dubai" is not cut in half). Lines that are not routes are
 * kept as plain text.
 */
export const parseRouteLegs = (text?: string | null): RouteLeg[] =>
  (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line): RouteLeg[] => {
      const segments = line.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (segments.length > 1 && segments.every((s) => toStops(s).length >= 2)) {
        return segments.map((s) => ({ stops: toStops(s), text: '' }));
      }
      const stops = toStops(line);
      return [stops.length >= 2 ? { stops, text: '' } : { stops: [], text: line }];
    });
