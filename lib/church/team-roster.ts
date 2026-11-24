import {
  CHURCH_BOARD_NAMES,
  CHURCH_LEADERSHIP_NAMES,
  CHURCH_MUSIC_TEAM_NAMES,
} from "@/lib/church/leadership";

export const CHURCH_TEAM_KEYS = ["leadership", "board", "music"] as const;

export type ChurchTeamKey = (typeof CHURCH_TEAM_KEYS)[number];

export type ChurchRosterTeam = {
  team: ChurchTeamKey;
  label: string;
  sortOrder: number;
};

export type ChurchRosterPerson = {
  key: string;
  officialName: string;
  teams: ChurchRosterTeam[];
};

const TEAM_DEFINITIONS: {
  team: ChurchTeamKey;
  label: string;
  names: readonly string[];
}[] = [
  {
    team: "leadership",
    label: "Church Leadership",
    names: CHURCH_LEADERSHIP_NAMES,
  },
  { team: "board", label: "Church Board", names: CHURCH_BOARD_NAMES },
  { team: "music", label: "Music Team", names: CHURCH_MUSIC_TEAM_NAMES },
];

const TITLE_WORDS = new Set([
  "pastor",
  "rev",
  "reverend",
  "dr",
  "mr",
  "mrs",
  "ms",
]);

export function churchRosterKey(name: string) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function churchPersonInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .filter((part) => !TITLE_WORDS.has(part.toLowerCase().replace(/\./g, "")));
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function churchRoster(): ChurchRosterPerson[] {
  const people = new Map<string, ChurchRosterPerson>();
  for (const definition of TEAM_DEFINITIONS) {
    definition.names.forEach((officialName, sortOrder) => {
      const key = churchRosterKey(officialName);
      const person = people.get(key) ?? { key, officialName, teams: [] };
      if (!person.teams.some((team) => team.team === definition.team)) {
        person.teams.push({
          team: definition.team,
          label: definition.label,
          sortOrder,
        });
      }
      people.set(key, person);
    });
  }
  return [...people.values()];
}

export function churchTeamLabel(team: ChurchTeamKey) {
  return TEAM_DEFINITIONS.find((definition) => definition.team === team)?.label ?? team;
}

export function churchTeamSections() {
  return TEAM_DEFINITIONS.map((definition) => ({
    team: definition.team,
    heading: definition.label,
    headingId:
      definition.team === "leadership"
        ? "church-leadership-heading"
        : definition.team === "board"
          ? "church-board-heading"
          : "music-team-heading",
    people: churchRoster()
      .filter((person) =>
        person.teams.some((team) => team.team === definition.team),
      )
      .sort((left, right) => {
        const leftOrder =
          left.teams.find((team) => team.team === definition.team)?.sortOrder ??
          0;
        const rightOrder =
          right.teams.find((team) => team.team === definition.team)?.sortOrder ??
          0;
        return leftOrder - rightOrder;
      }),
  }));
}
